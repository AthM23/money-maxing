import type { Db } from "../ledger/db.js";
import { qboEscape, type QboClient, type QboEntity } from "../connectors/qboClient.js";
import { decimal, rate } from "./local.js";
import type { World, WorldInvoice, WorldParty } from "./world.js";

/**
 * Seeds the QuickBooks Online sandbox from the world file. Phase 1: customers, vendors and the live period's
 * invoices; pass `periods` to add Q2 later. Idempotent three ways: the manifest (fast path, no network), then a
 * lookup by the natural key in QBO (DisplayName / DocNumber / item Name) which ADOPTS what is already there, and
 * only then a create. Sequential on purpose: ~35 records is nowhere near the 500 req/min cap.
 */

export const QBO_SYSTEM = "quickbooks";
export const QBO_ITEM_NAME = "Platform subscription";
/** The item is not a world record, so it gets a synthetic world id for its manifest row. */
export const QBO_ITEM_WORLD_ID = "qbo-item:platform-subscription";

export type QboSeedKind = "customer" | "vendor" | "invoice" | "item";
export interface QboSeedCount { created: number; adopted: number; skipped: number; removed: number }
export type QboSeedCounts = Record<QboSeedKind, QboSeedCount>;

export interface SeedQuickBooksOpts {
  /** Remove everything the manifest says we seeded (delete invoices, deactivate names and items), then seed again. */
  reset?: boolean;
  /** Invoice periods as `YYYY-MM` prefixes of issue_date. Default: the world's live period only. */
  periods?: string[];
  log?: (s: string) => void;
}

interface ManifestRow { world_id: string; system: string; kind: string; external_id: string; seeded_at: string }

const ENTITY: Record<QboSeedKind, string> = { customer: "Customer", vendor: "Vendor", invoice: "Invoice", item: "Item" };

/**
 * Integer cents → the JSON number QBO wants. cents/100 is not exact in binary, but for a 2dp value the nearest
 * double round-trips: toFixed(2) gives the intended decimal string and Number() of that is the double JSON.stringify
 * prints back as the same 2dp text. No arithmetic is done on the result, so nothing can accumulate.
 */
export function centsToQboAmount(cents: number): number {
  if (!Number.isSafeInteger(cents)) throw new Error(`amount must be integer cents, got ${cents}`);
  return Number((cents / 100).toFixed(2));
}

export async function seedQuickBooks(db: Db, world: World, client: QboClient, opts: SeedQuickBooksOpts = {}): Promise<QboSeedCounts> {
  const log = opts.log ?? (() => {});
  const periods = opts.periods ?? [world.meta.live_period];
  const zero = (): QboSeedCount => ({ created: 0, adopted: 0, skipped: 0, removed: 0 });
  const counts: QboSeedCounts = { customer: zero(), vendor: zero(), invoice: zero(), item: zero() };

  const getRow = db.prepare("SELECT * FROM seed_manifest WHERE world_id = ? AND system = ?");
  const upsertRow = db.prepare(
    `INSERT INTO seed_manifest (world_id, system, kind, external_id, seeded_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (world_id, system) DO UPDATE SET kind = excluded.kind, external_id = excluded.external_id, seeded_at = excluded.seeded_at`,
  );
  const deleteRow = db.prepare("DELETE FROM seed_manifest WHERE world_id = ? AND system = ?");
  const manifest = (worldId: string): ManifestRow | undefined => getRow.get(worldId, QBO_SYSTEM) as ManifestRow | undefined;

  /** Every write is verified by the Id on the entity QBO returned, never by searching for it afterwards. */
  const record = (worldId: string, kind: QboSeedKind, entity: QboEntity | undefined, how: "created" | "adopted"): string => {
    const id = entity?.Id;
    if (typeof id !== "string" || id === "") throw new Error(`QuickBooks ${how} ${kind} ${worldId} but returned no Id: ${JSON.stringify(entity).slice(0, 200)}`);
    upsertRow.run(worldId, QBO_SYSTEM, kind, id, new Date().toISOString());
    counts[kind][how]++;
    log(`quickbooks: ${how} ${kind} ${worldId} -> ${id}`);
    return id;
  };

  /** manifest → lookup-and-adopt → create. Returns the QBO Id. */
  const ensure = async (worldId: string, kind: QboSeedKind, findSql: string, body: () => Promise<Record<string, unknown>> | Record<string, unknown>): Promise<string> => {
    const row = manifest(worldId);
    if (row) {
      if (row.kind !== kind) throw new Error(`seed_manifest has ${worldId} as a ${row.kind}, cannot seed it as a ${kind}`);
      counts[kind].skipped++;
      return row.external_id;
    }
    const found = await client.query<QboEntity>(findSql);
    if (found[0]) return record(worldId, kind, found[0], "adopted");
    return record(worldId, kind, await client.create<QboEntity>(ENTITY[kind], await body()), "created");
  };

  if (opts.reset) await resetQuickBooks();

  // ---- names. DisplayName is the only queryable natural key, and it is unique ACROSS Customer, Vendor and Employee.
  const partyIds = new Map<string, string>();
  for (const p of world.parties) {
    if (p.kind !== "customer" && p.kind !== "vendor") continue; // 'other' (the unidentified payer), banks, employees: not QBO names
    const kind: QboSeedKind = p.kind;
    partyIds.set(p.id, await ensure(p.id, kind, `select * from ${ENTITY[kind]} where DisplayName = '${qboEscape(p.name)}'`, () => partyBody(p)));
  }

  // ---- invoices, oldest first so QBO's own lists read in order
  const invoices = world.invoices.filter((i) => periods.some((per) => i.issue_date.startsWith(per))).sort((a, b) => a.issue_date.localeCompare(b.issue_date) || a.id.localeCompare(b.id));
  let itemId: string | undefined;
  for (const inv of invoices) {
    if (inv.id.length > 21) throw new Error(`invoice id ${inv.id} is longer than QBO's 21-character DocNumber`);
    const customerId = partyIds.get(inv.party_id);
    if (customerId === undefined) throw new Error(`invoice ${inv.id} names party ${inv.party_id}, which is not a seeded customer`);
    await ensure(inv.id, "invoice", `select * from Invoice where DocNumber = '${qboEscape(inv.id)}'`, async () => {
      itemId ??= await ensureItem(); // only when an invoice is really about to be created: a fully seeded run makes no calls
      return invoiceBody(inv, customerId, itemId);
    });
  }

  return counts;

  async function ensureItem(): Promise<string> {
    return ensure(QBO_ITEM_WORLD_ID, "item", `select * from Item where Name = '${qboEscape(QBO_ITEM_NAME)}'`, async () => {
      const accounts = await client.query<QboEntity>("select * from Account where AccountType = 'Income' maxresults 1");
      const acct = accounts[0];
      if (!acct) throw new Error("QuickBooks company has no Income account to hang the service item on");
      // UNVERIFIED: Name + Type 'Service' + IncomeAccountRef is the full required set for a Service item
      return { Name: QBO_ITEM_NAME, Type: "Service", IncomeAccountRef: { value: acct.Id, ...(typeof acct.Name === "string" ? { name: acct.Name } : {}) } };
    });
  }

  /**
   * Invoices first (a customer with open invoices is the likeliest thing QBO refuses to deactivate), then names, then
   * items. A deactivated Customer/Vendor gets " (deleted)" appended to its DisplayName by QBO, so the DisplayName
   * lookup on the re-seed misses it and a fresh record is created rather than the dead one adopted.
   */
  async function resetQuickBooks(): Promise<void> {
    const order: QboSeedKind[] = ["invoice", "customer", "vendor", "item"];
    const rows = (db.prepare("SELECT * FROM seed_manifest WHERE system = ?").all(QBO_SYSTEM) as ManifestRow[])
      .sort((a, b) => order.indexOf(a.kind as QboSeedKind) - order.indexOf(b.kind as QboSeedKind));
    for (const row of rows) {
      const kind = row.kind as QboSeedKind;
      const entity = ENTITY[kind];
      if (entity === undefined) throw new Error(`seed_manifest row ${row.world_id} has unknown kind ${row.kind}`);
      let current: QboEntity | undefined;
      try {
        current = await client.read<QboEntity>(entity, row.external_id); // the SyncToken must be the current one
      } catch (e) {
        // A wiped or swapped sandbox company: the record is already gone, so only the manifest row is stale.
        // UNVERIFIED: a read of a missing id faults with code 610 "Object Not Found"
        if (!/object not found|\b610\b/i.test(e instanceof Error ? e.message : String(e))) throw e;
        log(`quickbooks: ${kind} ${row.world_id} (${row.external_id}) no longer exists, dropping its manifest row`);
      }
      if (current) {
        if (kind === "invoice") await client.remove(entity, { Id: current.Id, SyncToken: current.SyncToken });
        else if (current.Active !== false) await client.deactivate(entity, { Id: current.Id, SyncToken: current.SyncToken });
        counts[kind].removed++;
        log(`quickbooks: ${kind === "invoice" ? "deleted" : "deactivated"} ${kind} ${row.world_id} (${row.external_id})`);
      }
      deleteRow.run(row.world_id, QBO_SYSTEM); // per row, so a failure half-way leaves the manifest true to what is left
    }
  }
}

function partyBody(p: WorldParty): Record<string, unknown> {
  // Flat on purpose: Globex Labs is NOT made a sub-customer of Globex Holdings (ParentRef/Job). The parent paying for
  // the subsidiary is planted drift the agents have to learn from mail, not read off the customer list.
  if (p.kind === "customer") return { DisplayName: p.name, CompanyName: p.name, Notes: `fn:${p.id}` };
  // UNVERIFIED: Vendor.AcctNum is free text and long enough for `fn:<id>` (Vendor has no Notes field)
  return { DisplayName: p.name, CompanyName: p.name, AcctNum: `fn:${p.id}` };
}

function invoiceBody(inv: WorldInvoice, customerId: string, itemId: string): Record<string, unknown> {
  const amount = centsToQboAmount(inv.total_cents);
  // Gate 1, decision 5: the sandbox company stays single-currency (multicurrency cannot be switched off again), so a
  // foreign-currency invoice is mirrored at its USD booked amount with the foreign side stated in words.
  const foreign = inv.fx ? `${inv.fx.currency} ${decimal(inv.fx.foreign_total_cents)} at ${rate(inv.fx.booked_rate_ppm)}` : null;
  return {
    ...(foreign ? { CustomerMemo: { value: `Invoiced in ${inv.fx!.currency}: ${foreign} = USD ${decimal(inv.total_cents)}` } } : {}),
    // UNVERIFIED: a supplied DocNumber is honoured even when the company's "custom transaction numbers" setting is off
    DocNumber: inv.id,
    PrivateNote: `fn:${inv.id}`,
    TxnDate: inv.issue_date, // backdating is allowed, which is how history gets seeded
    DueDate: inv.due_date,
    CustomerRef: { value: customerId },
    Line: [{
      DetailType: "SalesItemLineDetail",
      Amount: amount,
      Description: `${QBO_ITEM_NAME} ${inv.issue_date.slice(0, 7)} (contract ${inv.contract_id})${foreign ? `, ${foreign}` : ""}`,
      // UNVERIFIED: no TaxCodeRef. A US sandbox company with automated sales tax may want TaxCodeRef {value: "NON"} here.
      SalesItemLineDetail: { ItemRef: { value: itemId }, Qty: 1, UnitPrice: amount },
    }],
  };
}
