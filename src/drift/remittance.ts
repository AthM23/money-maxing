import { parseRemittance, type Remittance } from "../contract/remittance.js";
import type { UnmatchedBankTxn } from "../ledger/read.js";
import type { Db } from "../runtime/db.js";
import { payloadText } from "../runtime/payloadText.js";

export function findRemittance(db: Db, txn: UnmatchedBankTxn): { trace_id: string; data: Remittance }[] {
  if (!txn.party_id) return [];
  const rows = db.prepare(`SELECT t.id, t.payload_json FROM trace t WHERE t.source = 'gmail' AND t.party_id = ?
    AND NOT EXISTS (SELECT 1 FROM trace n WHERE n.source = t.source AND n.external_id = t.external_id AND n.version > t.version)`)
    .all(txn.party_id) as { id: string; payload_json: string }[];
  return rows.flatMap(row => {
    const data = parseRemittance(payloadText(row.payload_json));
    return data && data.date === txn.posted_date && data.amount_cents === txn.unapplied_cents
      && txn.descriptor.split(/[^A-Za-z0-9-]+/).includes(data.reference) ? [{ trace_id: row.id, data }] : [];
  });
}
