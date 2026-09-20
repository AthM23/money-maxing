# Maximor's own website (captured 2026-09-19 ~22:20, pasted by Preet from maximor.com)

Why this matters: **their homepage hero is a four-beat demo widget that is exactly our system's loop.**
Mirroring their own structure makes the demo instantly legible to Maximor judges.

## The hero widget, verbatim structure

> One policy, end to end — Live
> 1. **Learns** — bank feed, Excel, NetSuite, SAP → `SHORT-PAY-01 · short ≤ $50 → auto-close`
> 2. **Runs** — Acme Freight #4471, −$38, posted & closed
> 3. **Escalates** — Byte Foods #7729, −$495, awaiting you · "Approve write-off?" → Chris, Controller
> 4. **Improves** — `SHORT-PAY-01 v2 · ≤ $50 or ≤ 5% freight` — updated
> "Every close, smarter."

Mapping to our build (all already exists or is planned):
| Their beat | Ours |
|---|---|
| Learns (policy reverse-engineered from history) | replay Q2 → compile repeated judgment into a policy |
| Runs (auto-post small stuff) | tier 0 compiled rule → kernel → posted, zero model calls |
| Escalates (above policy → named human) | Slack escalation to the judge's phone, approval matrix |
| Improves (policy v2 with a widened condition) | corrections compiled → policy v2 → replay CI gates it |

**Cheap, high-impact styling: name our policies like theirs** (`SHORT-PAY-01`, `SHORT-PAY-01 v2`) and show
the version bump on screen in beat 4.

## Facts to reuse (their site, their words)

- Trademark: **"Audit-Ready Agents™"** — our workpaper+kernel is the same claim made falsifiable.
- CFO benchmark stats: **96%** want AI on grunt work · **14%** trust it end to end · **97%** insist on
  human oversight. (We already cite the 14% via research; site confirms.)
- Customers on the wall: Instructure, Sierra, Groupon, Quantum (QMCO), Mini Melts, Synthesia, Kiteworks,
  Dura Software, Eightfold.ai, HiBid Auctions; case studies: **Rently 11→3 day close, $350K/yr** ·
  **Invst 4-day close, ASC 606 end-to-end, $250K/yr** · **Dura 12→7 days, 70% lower back-office cost,
  "buying back your team's judgment"** · **Kiteworks 98% of cash transactions automated**.
- Outcomes claimed: 90% of routine work untouched by humans · 100% of entries with audit trail ·
  **$2M+ returned per $100M revenue**.
- Platform pillars: revenue, cash, close, AR/AP, reporting, **instant answers** ("every answer cites its
  source; drill from any figure to the entry behind it" — our trace/workpaper view is this).
- Security page: **"No customer's data is ever used to train another's model."**

## Fine-tune angle (lane C)

Their no-cross-training promise implies per-customer models. Our pitch line: *"we take that to its logical
end — the customer's own kernel-verified decision traces fine-tune a small model that runs on the
customer's own hardware. The data never leaves the building, and the routine 90% gets cheaper every
close."* NorthwindBench's progression curve is the evidence.

## For the demo script (Atharv)

Open the five minutes as their widget, beat for beat, on our real systems: Learns (policy compiled from
Q2) → Runs (clean payment auto-posts) → Escalates (Wayne, to the judge's phone) → Improves (policy v2,
never asks again). Then the Initech ripple as the depth act, audit as the trust act, benchmark table as
the closing number.
