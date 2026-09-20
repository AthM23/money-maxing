import type { Db } from "../ledger/db.js";
import type { RawItem } from "../connectors/types.js";

const OWN_DOMAINS = new Set(["northwind.test"]);

/** Uppercase, punctuation to spaces, padded: "Pixel & Pine" and "PIXEL AND PINE" are different aliases on purpose. */
export function normalise(s: string): string {
  return ` ${s.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim()} `;
}

export interface Resolver {
  resolve(hint: RawItem["party_hint"]): string | null;
}

/**
 * Entity resolution in code, from the alias table only: explicit id, then a counterparty email domain, then the
 * longest alias found as whole words in free text (a thin bank descriptor). No guess: no alias, no party.
 */
export function buildResolver(db: Db): Resolver {
  const rows = db.prepare("SELECT party_id, alias FROM alias").all() as { party_id: string; alias: string }[];
  const parties = new Set((db.prepare("SELECT id FROM party").all() as { id: string }[]).map((r) => r.id));
  const domains = new Map<string, string>();
  const names: Array<{ norm: string; party_id: string }> = [];
  for (const r of rows) {
    if (/^[a-z0-9.-]+\.[a-z]{2,}$/.test(r.alias)) domains.set(r.alias.toLowerCase(), r.party_id);
    else names.push({ norm: normalise(r.alias), party_id: r.party_id });
  }
  names.sort((a, b) => b.norm.length - a.norm.length);

  return {
    resolve(hint) {
      if (!hint) return null;
      if (hint.party_id && parties.has(hint.party_id)) return hint.party_id;
      for (const email of hint.emails ?? []) {
        const domain = email.toLowerCase().split("@")[1];
        if (!domain || OWN_DOMAINS.has(domain)) continue;
        const hit = domains.get(domain);
        if (hit) return hit;
      }
      if (hint.text) {
        const text = normalise(hint.text);
        const hit = names.find((n) => text.includes(n.norm));
        if (hit) return hit.party_id;
      }
      return null;
    },
  };
}
