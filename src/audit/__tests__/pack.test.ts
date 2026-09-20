import { describe, expect, it } from "vitest";
import type { Db } from "../../runtime/db.js";
import { fixedClock } from "../../runtime/__tests__/seed.js";
import { buildAuditPack } from "../pack.js";
import { postApplyPayment, postCreditMemo, postSmallMemos, seedAudit } from "./helpers.js";

const INPUT = { period: "2026-07", seed: "q3-review", size: 2 };

function eventsOn(db: Db, topic: string): Record<string, unknown>[] {
  const rows = db.prepare("SELECT payload_json FROM event WHERE topic = ? ORDER BY id").all(topic) as { payload_json: string }[];
  return rows.map((row) => JSON.parse(row.payload_json) as Record<string, unknown>);
}

/** Four small credits to one party would themselves be a split transaction, so a clean July takes one. */
function packedDb(smallMemos: number): Db {
  const db = seedAudit();
  postApplyPayment(db);
  postCreditMemo(db);
  postSmallMemos(db, smallMemos);
  return db;
}

describe("buildAuditPack", () => {
  it("re-performs a clean July with no findings and still emits the pack event", () => {
    const db = packedDb(1);
    const pack = buildAuditPack(db, fixedClock, INPUT);
    expect(pack.population_size).toBe(3);
    expect(pack.summary.sampled).toBe(pack.sample.must_test.length + pack.sample.random.length);
    expect(pack.summary.findings_total).toBe(0);
    expect(pack.summary.reperformed_clean_share).toBe(1);
    expect(eventsOn(db, "audit.finding.raised")).toHaveLength(0);
    expect(eventsOn(db, "audit.pack.ready")).toHaveLength(1);
    expect(eventsOn(db, "audit.pack.ready")[0]).toMatchObject({ period: "2026-07", seed: "q3-review", population_size: 3 });
  });

  it("emits one audit.finding.raised per finding, and its summary counts agree with the findings", () => {
    const db = packedDb(4);
    db.prepare("UPDATE trace SET payload_json = ? WHERE id = 'tr_email_1'").run(JSON.stringify({ body: "rewritten after the fact" }));
    db.prepare("INSERT INTO party (id, kind, name) VALUES ('ven_a','vendor','Acme, Inc.'), ('ven_b','vendor','ACME LLC')").run();
    const pack = buildAuditPack(db, fixedClock, INPUT);

    const raised = eventsOn(db, "audit.finding.raised");
    expect(raised).toHaveLength(pack.summary.findings_total);
    expect(pack.summary.findings_total).toBeGreaterThan(0);
    const counted = Object.values(pack.summary.findings_by_type).reduce((sum, n) => sum + n, 0);
    expect(counted).toBe(pack.summary.findings_total);
    const fromResults = pack.reperformance.flatMap((r) => r.findings).length + pack.controls.findings.length;
    expect(fromResults).toBe(pack.summary.findings_total);
    const types = raised.map((event) => event.type);
    expect(types).toContain("evidence_invalidated");
    expect(types).toContain("duplicate_vendor");
    expect(types).toContain("split_transaction");
    expect(raised.every((event) => event.period === "2026-07" && event.seed === "q3-review")).toBe(true);
  });

  it("re-performs exactly the sampled decisions, and reports the clean share over them", () => {
    const db = packedDb(4);
    const pack = buildAuditPack(db, fixedClock, INPUT);
    const sampled = [...pack.sample.must_test, ...pack.sample.random].map((item) => item.decision_id);
    expect(pack.reperformance.map((r) => r.decision_id)).toEqual(sampled);
    expect(pack.summary.reperformed_clean).toBe(pack.reperformance.filter((r) => r.findings.length === 0).length);
    expect(pack.materiality_cents).toBe(50_000);
    expect(JSON.parse(JSON.stringify(pack))).toEqual(pack);
  });
});
