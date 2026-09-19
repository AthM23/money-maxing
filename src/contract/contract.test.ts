import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ACCOUNTS, ALL_ACCOUNTS, ALL_TOOL_NAMES, ALL_TOPICS, AUDITOR_DENIED_TOOLS, FUNCTIONS, Mark, Proposal, ROUTES,
  REVERSAL_MODES, TOOLS, fromMcpName, isTopic, openMemoryDb, toMcpName, type Db,
} from './index.js';

const NOW = '2026-07-31T12:00:00Z';

/** The Initech credit memo from the demo spine: Dr deferred revenue / Cr AR, quote from the CEO email. */
const initech = {
  intent_id: 'int_1',
  function: 'ar',
  kind: 'credit_memo',
  party_id: 'cust_initech',
  applications: [{ doc_id: 'inv_1042', amount_cents: 120000 }],
  entries: [
    { account: ACCOUNTS.DEFERRED_REVENUE.code, debit_cents: 120000, credit_cents: 0, memo: '10% concession INV-1042' },
    { account: ACCOUNTS.AR.code, debit_cents: 0, credit_cents: 120000, memo: '10% concession INV-1042' },
  ],
  terms_change: { pct_off: 10, until: '2027-03-31' },
  evidence: [{ claim: 'CEO granted 10% off through renewal', trace_id: 'tr_email_1', quote: '10% off through renewal' }],
  policy_refs: [],
  fact_refs: [],
  judgment: [{ note: 'Treated as a prospective price concession', confidence: 'high' }],
};

describe('schema.sql', () => {
  let db: Db;
  beforeEach(() => { db = openMemoryDb(); });
  afterEach(() => { db.close(); });

  const tableNames = () =>
    (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[]).map((r) => r.name);

  it('creates every spec §7 table and the Phase 0 additions', () => {
    const spec = [
      'customer', 'vendor', 'contract', 'invoice', 'po', 'receipt', 'bill', 'bank_txn', 'payroll_run', 'period', 'gl_entry', 'gl_line',
      'trace', 'decision_point', 'intent', 'decision', 'workpaper', 'artifact', 'fact', 'policy', 'replay_result', 'escalation',
      'event', 'checklist_item', 'forecast_line', 'forecast_miss',
    ];
    const additions = ['party', 'alias', 'account', 'application', 'schedule', 'schedule_line', 'approval', 'blocked_attempt', 'event_cursor', 'seed_manifest'];
    expect(tableNames().sort()).toEqual([...spec, ...additions].sort());
  });

  it('has the minimum Phase 0 columns', () => {
    const cols = (t: string) => (db.prepare(`SELECT name FROM pragma_table_info('${t}')`).all() as { name: string }[]).map((r) => r.name);
    expect(cols('trace')).toEqual(expect.arrayContaining(['event_time', 'recorded_time', 'ingested_at', 'content_hash']));
    expect(cols('gl_entry')).toEqual(expect.arrayContaining(['posted_at', 'reversal_mode']));
    expect(cols('period')).toContain('locked_at');
    expect(cols('decision')).toEqual(expect.arrayContaining(['route', 'posted_at']));
    expect(cols('fact')).toEqual(expect.arrayContaining(['authority_ceiling_cents', 'explained_amount_cents']));
  });

  it('every table is STRICT and every *_cents column is INTEGER', () => {
    for (const t of tableNames()) {
      const { strict } = db.prepare(`SELECT strict FROM pragma_table_list WHERE name = ?`).get(t) as { strict: number };
      expect(strict, `${t} is STRICT`).toBe(1);
      const cols = db.prepare(`SELECT name, type FROM pragma_table_info('${t}')`).all() as { name: string; type: string }[];
      for (const c of cols.filter((c) => c.name.endsWith('_cents'))) expect(c.type, `${t}.${c.name}`).toBe('INTEGER');
    }
  });

  it('passes foreign_key_check and seeds the core chart of accounts', () => {
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(db.pragma('foreign_key_check')).toEqual([]);
    const n = db.prepare('SELECT count(*) AS n FROM account').get() as { n: number };
    expect(n.n).toBe(ALL_ACCOUNTS.length);
    const controls = db.prepare('SELECT code, control_for FROM account WHERE control_for IS NOT NULL ORDER BY code').all();
    expect(controls).toEqual([{ code: '1100', control_for: 'AR' }, { code: '2000', control_for: 'AP' }]);
  });

  it('rejects fractional cents', () => {
    db.prepare("INSERT INTO party (id, kind, name, created_at) VALUES ('c1', 'customer', 'Initech', ?)").run(NOW);
    const ins = db.prepare(
      "INSERT INTO invoice (id, number, customer_id, issue_date, due_date, amount_cents, open_cents, status) VALUES (?, ?, 'c1', '2026-07-01', '2026-07-31', ?, ?, 'open')",
    );
    ins.run('i1', 'INV-1', 1200000, 1200000);
    expect(() => ins.run('i2', 'INV-2', 12000.5, 12000.5)).toThrow();
  });

  function postEntry(id: string) {
    db.prepare("INSERT OR IGNORE INTO period (id, status) VALUES ('2026-07', 'open')").run();
    db.prepare("INSERT INTO gl_entry (id, period, date, memo, posted_at, posted_by) VALUES (?, '2026-07', '2026-07-15', 'm', ?, 'seed')").run(id, NOW);
  }

  it('gl_line takes exactly one non-zero side and a known account', () => {
    postEntry('e1');
    const line = db.prepare('INSERT INTO gl_line (entry_id, line_no, account, debit_cents, credit_cents) VALUES (?, ?, ?, ?, ?)');
    line.run('e1', 1, '2300', 120000, 0);
    line.run('e1', 2, '1100', 0, 120000);
    expect(() => line.run('e1', 3, '1000', 100, 100)).toThrow(/CHECK/);
    expect(() => line.run('e1', 4, '1000', 0, 0)).toThrow(/CHECK/);
    expect(() => line.run('e1', 5, '1000', -5, 0)).toThrow(/CHECK/);
    expect(() => line.run('e1', 6, '9999', 5, 0)).toThrow(/FOREIGN KEY/);
  });

  it('reversal_mode is constrained to the contract values', () => {
    postEntry('e1');
    for (const m of REVERSAL_MODES) db.prepare('UPDATE gl_entry SET reversal_mode = ? WHERE id = ?').run(m, 'e1');
    expect(() => db.prepare("UPDATE gl_entry SET reversal_mode = 'sometimes' WHERE id = 'e1'").run()).toThrow(/CHECK/);
  });

  it('trace is idempotent on source + external_id + version', () => {
    const ins = db.prepare(
      "INSERT INTO trace (id, source, kind, external_id, event_time, recorded_time, ingested_at, content_hash, version, payload_json) VALUES (?, 'gmail', 'email', 'msg-1', ?, ?, ?, 'h', ?, '{}')",
    );
    ins.run('t1', '2026-06-28T14:00:00Z', '2026-06-28T14:00:05Z', NOW, 1);
    expect(() => ins.run('t2', '2026-06-28T14:00:00Z', '2026-06-28T14:00:05Z', NOW, 1)).toThrow(/UNIQUE/);
    ins.run('t3', '2026-06-28T14:00:00Z', '2026-07-02T09:00:00Z', NOW, 2); // evidence reversioned
  });

  it('a model can review but only a human can approve', () => {
    db.prepare("INSERT INTO decision (id, function, mode, kind, proposal_json, actor, autonomy_level, created_at) VALUES ('d1', 'ar', 'live', 'credit_memo', '{}', 'claude-sonnet-5', 'review', ?)").run(NOW);
    const ins = db.prepare("INSERT INTO approval (id, decision_id, role, actor, actor_kind, disposition, channel, created_at) VALUES (?, 'd1', ?, ?, ?, 'approved', 'api', ?)");
    ins.run('a1', 'reviewer', 'gpt-controller', 'model', NOW);
    ins.run('a2', 'approver', 'U_CONTROLLER', 'human', NOW);
    expect(() => ins.run('a3', 'approver', 'gpt-controller', 'model', NOW)).toThrow(/CHECK/);
  });

  it('a block cannot be lifted and verified by the same person', () => {
    const ins = db.prepare("INSERT INTO blocked_attempt (id, function, rule, reason, actor, created_at, lifted_by, verified_by) VALUES (?, 'ap', 'vendor_bank_change', 'r', 'runtime', ?, ?, ?)");
    ins.run('b1', NOW, 'U_AP', 'U_CONTROLLER');
    expect(() => ins.run('b2', NOW, 'U_AP', 'U_AP')).toThrow(/CHECK/);
  });

  it('an open drift intent is unique per dedupe_key until it closes', () => {
    const ins = db.prepare("INSERT INTO intent (id, function, question, owner, status, dedupe_key, created_at) VALUES (?, 'ar', 'q', 'ar', ?, 'drift:inv_cash:inv_1042', ?)");
    ins.run('i1', 'open', NOW);
    expect(() => ins.run('i2', 'open', NOW)).toThrow(/UNIQUE/);
    db.prepare("UPDATE intent SET status = 'closed' WHERE id = 'i1'").run();
    ins.run('i2', 'open', NOW);
  });

  it('event ids are monotonic bus order', () => {
    const ins = db.prepare("INSERT INTO event (ts, topic, from_function) VALUES (?, 'ingest.committed', 'ingest')");
    const a = ins.run(NOW).lastInsertRowid;
    const b = ins.run(NOW).lastInsertRowid;
    expect(Number(b)).toBe(Number(a) + 1);
  });
});

describe('Proposal and Mark', () => {
  it('accepts the Initech credit memo', () => {
    expect(Proposal.parse(initech)).toMatchObject({ kind: 'credit_memo', function: 'ar' });
  });

  it('rejects float cents, two-sided lines, unknown kinds and unknown functions', () => {
    const bad = (patch: object) => Proposal.safeParse({ ...initech, ...patch }).success;
    expect(bad({ applications: [{ doc_id: 'inv_1042', amount_cents: 1200.5 }] })).toBe(false);
    expect(bad({ entries: [{ account: '1100', debit_cents: 5, credit_cents: 5, memo: '' }] })).toBe(false);
    expect(bad({ entries: [{ account: '1100', debit_cents: 0, credit_cents: 0, memo: '' }] })).toBe(false);
    expect(bad({ kind: 'journal_whatever' })).toBe(false);
    expect(bad({ function: 'tax' })).toBe(false);
    expect(bad({ reversal_mode: 'sometimes' })).toBe(false);
  });

  it('leaves balance to the kernel: an unbalanced proposal still parses', () => {
    const unbalanced = { ...initech, entries: [initech.entries[0]] };
    expect(Proposal.safeParse(unbalanced).success).toBe(true);
  });

  it('parses a Mark', () => {
    const m = Mark.parse({ cls: 'E', check: 'quote_is_substring', status: 'pass', detail: '', refs: ['tr_email_1'] });
    expect(m.cls).toBe('E');
    expect(Mark.safeParse({ ...m, cls: 'X' }).success).toBe(false);
  });
});

describe('registries', () => {
  it('has the 50 canonical topics, exactly as EVENT_TOPICS.md lists them', () => {
    const md = readFileSync(new URL('../../context/diagrams/architecture/EVENT_TOPICS.md', import.meta.url), 'utf8');
    const section = md.slice(md.indexOf('## (a)'), md.indexOf('Gaps the list exposes'));
    const listed = [...section.matchAll(/^\| \d+ \| `([^`]+)` \|/gm)].map((m) => m[1]);
    expect(listed).toHaveLength(50);
    expect([...ALL_TOPICS].sort()).toEqual([...listed].sort());
    expect(new Set(ALL_TOPICS).size).toBe(50);
    expect(isTopic('ar.credit_memo.posted')).toBe(true);
    expect(isTopic('period.locked')).toBe(false);
  });

  it('has every spec §8 tool name once, and they survive the MCP name mapping', () => {
    const spec = readFileSync(new URL('../../context/PROJECT_SPEC.md', import.meta.url), 'utf8');
    const section = spec.slice(spec.indexOf('## 8. Frozen tool interface'), spec.indexOf('```ts'));
    const expected = new Set<string>();
    // `ledger.*` (a, b) groups, then every other backticked name with its optional (args)
    for (const m of section.matchAll(/`(\w+)\.\*` \(([^)]+)\)/g)) for (const n of m[2]!.split(',')) expected.add(`${m[1]}.${n.trim()}`);
    for (const m of section.matchAll(/`([a-z_]+(?:\.[a-z_]+)?)(?:\([^)]*\))?`/g)) expected.add(m[1]!);
    expect([...ALL_TOOL_NAMES].sort()).toEqual([...expected].sort());
    expect(new Set(ALL_TOOL_NAMES).size).toBe(ALL_TOOL_NAMES.length);
    for (const n of ALL_TOOL_NAMES) {
      expect(toMcpName(n)).toMatch(/^[a-zA-Z0-9_-]{1,64}$/);
      expect(fromMcpName(toMcpName(n))).toBe(n);
    }
  });

  it('only propose_entry and its siblings write; the auditor never sees preparer memory', () => {
    const writers = Object.values(TOOLS).filter((t) => t.access === 'write').map((t) => t.name).sort();
    expect(writers).toEqual(['close.mark', 'escalate', 'finish', 'handoff', 'propose_entry', 'record_fact_candidate']);
    expect(AUDITOR_DENIED_TOOLS.every((n) => n.startsWith('memory.'))).toBe(true);
  });

  it('functions and routes match the corpus index', () => {
    const csv = readFileSync(new URL('../../tests/cases.csv', import.meta.url), 'utf8').trim().split(/\r?\n/).slice(1);
    const rows = csv.map((l) => l.match(/("[^"]*"|[^,]*)(,|$)/g)!.map((c) => c.replace(/,$/, '')));
    const routes = new Set(rows.map((r) => r[3]!));
    const packs = new Set(rows.map((r) => r[6]!));
    expect([...routes].filter((r) => r !== 'INVARIANT').sort()).toEqual([...ROUTES].sort());
    // 'kernel' and 'platform' are cross-cutting corpus sections, not function packs; 'equity' has no corpus cases
    expect([...packs].filter((p) => p !== 'kernel' && p !== 'platform').every((p) => (FUNCTIONS as readonly string[]).includes(p))).toBe(true);
  });
});
