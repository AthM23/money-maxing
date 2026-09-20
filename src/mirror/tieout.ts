import type { Db } from "../ledger/db.js";
import { QBO_SYSTEM } from "../seed/quickbooks.js";
import { centsToDecimal, readProposal } from "./payloads.js";
import type { QboLike, QboObject } from "./types.js";

/**
 * Read-only tie-out of the two subledgers against QuickBooks: every local invoice and bill that QuickBooks also
 * holds, open balance against open balance. The local ledger is the system of record and the mirror is one-way, so a
 * difference has exactly two honest causes: something posted here has not been mirrored yet (`explained`, with the
 * amount), or somebody changed QuickBooks (`differs`). Sends only queries.
 */

export type TieStatus = "agrees" | "explained" | "differs";
export interface TieRow {
  doc_id: string; party: string; local_open_cents: number; qbo_open_cents: number; status: TieStatus;
  /** Posted locally, applied to this document, not yet 'mirrored' in mirror_log. */
  unmirrored_cents: number;
}
export interface TieSide {
  rows: TieRow[];
  /** Local documents with an open balance that QuickBooks does not hold at all. */
  missing_in_qbo: Array<{ doc_id: string; party: string; local_open_cents: number }>;
  /** Documents of ours in QuickBooks that this database does not know: another world seeded into the same company. */
  other_world: number;
  local_open_cents: number;
  qbo_open_cents: number;
}
export interface TieOut { ar: TieSide; ap: TieSide; ok: boolean }

/** `open_cents` is what the ledger carries (a bill nobody approved yet is not a payable); `unsettled_cents` is what the document still shows. */
interface LocalDoc { id: string; doc_number: string; party: string; open_cents: number; unsettled_cents: number }

export async function tieOut(db: Db, client: QboLike): Promise<TieOut> {
  const invoices = db.prepare("SELECT i.id, i.id AS doc_number, p.name AS party, i.open_cents, i.open_cents AS unsettled_cents FROM invoice i JOIN party p ON p.id = i.party_id WHERE i.status != 'void'").all() as LocalDoc[];
  const bills = db.prepare("SELECT b.id, b.vendor_invoice_no AS doc_number, p.name AS party, CASE WHEN b.status IN ('approved','scheduled') THEN b.open_cents ELSE 0 END AS open_cents, b.open_cents AS unsettled_cents FROM bill b JOIN party p ON p.id = b.party_id WHERE b.status != 'void'").all() as LocalDoc[];
  const unmirrored = unmirroredByDoc(db);
  const ar = side(invoices, await client.query("select * from Invoice maxresults 1000"), unmirrored, (o) => /^INV-/.test(String(o.DocNumber ?? "")));
  const ap = side(bills, await client.query("select * from Bill maxresults 1000"), unmirrored, (o) => String(o.PrivateNote ?? "").startsWith("fn:"));
  return { ar, ap, ok: [...ar.rows, ...ap.rows].every((r) => r.status !== "differs") };
}

function side(local: LocalDoc[], remote: QboObject[], unmirrored: Map<string, number>, ours: (o: QboObject) => boolean): TieSide {
  const byDoc = new Map(remote.map((o) => [String(o.DocNumber ?? ""), o]));
  const rows: TieRow[] = [];
  const missing: TieSide["missing_in_qbo"] = [];
  for (const d of local) {
    const o = byDoc.get(d.doc_number);
    if (!o) {
      if (d.unsettled_cents > 0) missing.push({ doc_id: d.id, party: d.party, local_open_cents: d.unsettled_cents });
      continue;
    }
    const qboOpen = Math.round(Number(o.Balance ?? 0) * 100);
    const pending = unmirrored.get(d.id) ?? 0;
    const status: TieStatus = qboOpen === d.open_cents ? "agrees" : qboOpen - d.open_cents === pending ? "explained" : "differs";
    rows.push({ doc_id: d.id, party: d.party, local_open_cents: d.open_cents, qbo_open_cents: qboOpen, status, unmirrored_cents: pending });
  }
  const known = new Set(local.map((d) => d.doc_number));
  return {
    rows, missing_in_qbo: missing, other_world: remote.filter((o) => ours(o) && !known.has(String(o.DocNumber ?? ""))).length,
    local_open_cents: rows.reduce((sum, r) => sum + r.local_open_cents, 0), qbo_open_cents: rows.reduce((sum, r) => sum + r.qbo_open_cents, 0),
  };
}

/** Per document: what posted ledger entries applied to it (a dispute hold moves nothing), less the decisions every one of whose QuickBooks objects is 'mirrored'. */
function unmirroredByDoc(db: Db): Map<string, number> {
  const posted = db.prepare("SELECT id, proposal_json FROM decision d WHERE posted_at IS NOT NULL AND mode = 'live' AND EXISTS (SELECT 1 FROM gl_entry e WHERE e.source_decision_id = d.id)").all() as Array<{ id: string; proposal_json: string | null }>;
  const open = db.prepare("SELECT COUNT(*) AS n, SUM(status = 'mirrored') AS done FROM mirror_log WHERE decision_id = ? AND system = ?");
  const out = new Map<string, number>();
  for (const d of posted) {
    const log = open.get(d.id, QBO_SYSTEM) as { n: number; done: number | null };
    if (log.n > 0 && log.done === log.n) continue;
    for (const a of readProposal(d.proposal_json)?.applications ?? []) out.set(a.doc_id, (out.get(a.doc_id) ?? 0) + a.amount_cents);
  }
  return out;
}

const MISSING_SHOWN = 5;

export function tieOutText(t: TieOut): string {
  const lines: string[] = [];
  for (const [name, s] of [["AR (invoices)", t.ar], ["AP (bills)", t.ap]] as const) {
    const count = (st: TieStatus): number => s.rows.filter((r) => r.status === st).length;
    lines.push(`${name}: ${s.rows.length} in both · local open $${centsToDecimal(s.local_open_cents)} · QuickBooks open $${centsToDecimal(s.qbo_open_cents)} · ${count("agrees")} agree, ${count("explained")} explained by entries not mirrored yet, ${count("differs")} differ`);
    for (const r of s.rows.filter((x) => x.status !== "agrees")) {
      lines.push(`  ${r.status.padEnd(9)} ${r.doc_id.padEnd(10)} ${r.party.padEnd(30)} local ${centsToDecimal(r.local_open_cents).padStart(12)}  QuickBooks ${centsToDecimal(r.qbo_open_cents).padStart(12)}  not mirrored ${centsToDecimal(r.unmirrored_cents).padStart(12)}`);
    }
    const missing = s.missing_in_qbo;
    if (missing.length > MISSING_SHOWN) lines.push(`  missing   ${missing.length} open local documents, $${centsToDecimal(missing.reduce((sum, m) => sum + m.local_open_cents, 0))}, still unsettled here, are not in QuickBooks at all (the seeder creates no ${name.startsWith("AP") ? "Bills" : "Invoices outside the live period"})`);
    else for (const m of missing) lines.push(`  missing   ${m.doc_id.padEnd(10)} ${m.party.padEnd(30)} local ${centsToDecimal(m.local_open_cents).padStart(12)}  not in QuickBooks`);
    if (s.other_world > 0) lines.push(`  (${s.other_world} of our documents in QuickBooks belong to another world seeded into the same company)`);
  }
  lines.push(t.ok ? "tie-out: nothing differs" : "tie-out: DIFFERENCES that no unmirrored entry explains");
  return lines.join("\n");
}
