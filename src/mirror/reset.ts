import type { QboRef } from "../connectors/qboClient.js";
import type { Db } from "../ledger/db.js";
import { QBO_SYSTEM } from "../seed/quickbooks.js";
import { MIRROR_SUBSCRIBER } from "./mirror.js";
import type { QboObject } from "./types.js";

/**
 * Takes QuickBooks back to the seeded state: deletes every object the MIRROR made and nothing the seeder made, so the
 * same demo can be shown again. The mirror's objects are found in QuickBooks itself, by the `fn:dec_…` marker every one
 * of them carries in PrivateNote (the seeder's carry `fn:<world id>`, never a decision id), because the stage database
 * is thrown away between runs and its mirror_log with it. Payments go first: they are what ties a CreditMemo or a
 * JournalEntry to its invoice, and QuickBooks refuses to delete a linked object. Files attached to a credit memo go with
 * it. Locally, the mirror's log, ripples and artifacts are cleared and its bus cursor rewound, so the next pass on this
 * database mirrors everything again.
 */

/** The two calls a reset makes. `QboClient` satisfies it as is. */
export interface QboResettable {
  query<T = QboObject>(sql: string): Promise<T[]>;
  remove(entity: string, ref: QboRef): Promise<void>;
}

export interface MirrorResetResult { removed: Record<string, number>; failed: Array<{ entity: string; id: string; error: string }> }

const MIRROR_MARKER = "fn:dec_";
/** Deletion order. */
const ENTITIES = ["Payment", "CreditMemo", "JournalEntry"] as const;

export async function resetMirror(db: Db | null, client: QboResettable, log: (s: string) => void = () => {}): Promise<MirrorResetResult> {
  const result: MirrorResetResult = { removed: {}, failed: [] };
  const remove = async (entity: string, o: QboObject): Promise<void> => {
    try {
      await client.remove(entity, { Id: o.Id, SyncToken: String(o.SyncToken ?? "0") });
      result.removed[entity] = (result.removed[entity] ?? 0) + 1;
      log(`quickbooks: deleted ${entity} ${o.Id} ${String(o.DocNumber ?? o.PaymentRefNum ?? o.FileName ?? "")}`.trimEnd());
    } catch (err) {
      result.failed.push({ entity, id: o.Id, error: (err instanceof Error ? err.message : String(err)).slice(0, 300) });
    }
  };
  for (const entity of ENTITIES) {
    const ours = (await client.query(`select * from ${entity} maxresults 1000`)).filter((o) => String(o.PrivateNote ?? "").startsWith(MIRROR_MARKER));
    for (const o of ours) {
      if (entity === "CreditMemo") for (const file of await client.query(`select * from Attachable where AttachableRef.EntityRef.Type = 'CreditMemo' and AttachableRef.EntityRef.value = '${o.Id}'`)) await remove("Attachable", file);
      await remove(entity, o);
    }
  }
  if (db) {
    db.transaction(() => {
      db.prepare("DELETE FROM mirror_log WHERE system = ?").run(QBO_SYSTEM);
      db.prepare("DELETE FROM ripple WHERE kind LIKE 'qbo\\_%' ESCAPE '\\'").run();
      db.prepare("DELETE FROM artifact WHERE system = ?").run(QBO_SYSTEM);
      db.prepare("DELETE FROM event_cursor WHERE subscriber = ?").run(MIRROR_SUBSCRIBER);
    })();
  }
  return result;
}
