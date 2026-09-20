# 05 — Maximor PDF: "The Usage-Based Revenue Recognition Playbook"

Source: `context/research/Usage-Based Revenue Recognition for AI-Native Companies.pdf`, saved from Maximor's site by
Atharv on 2026-09-19. 38 pages, read in full (text extracted with pypdf; figures not viewed). Subtitle: "ASC 606 ·
Practitioner Guide · Six questions, six audit ready answers". Author: **Shruthi Sathyanarayanan, Founding Strategist
at Maximor AI**, "helping build AI-powered modules for revenue recognition (ASC 606 / IFRS 15), invoicing, accruals,
and close management". All company names in its scenarios are fictional (its own disclaimer).

Quotes below are verbatim from the PDF. "Our reading" sections are ours.

## What it is

A guide for controllers at AI-native, usage-priced companies ("per token, per inference, per GB, per API call, or per
resolved outcome", often reselling frontier-model capacity). Each of six sections has the same structure: **the
controller's question in the first person → accounting theory with codification references → a scenario with specific
numbers → a decision tree → an operational solution.** Pages 35-37 then pitch Maximor's architecture.

## The six questions

| # | Question (verbatim) | Scenario and numbers | Answer | In our reach? |
|---|---|---|---|---|
| 01 | "I charge a big upfront fee to fine-tune a custom model — is that its own deliverable, or do I spread it over the usage term?" | $250,000 nonrefundable fee + $0.02 / 1,000 tokens over a 24-month hosted term | Hosted only: fulfilment activity, recognise over 24 months. Weights delivered under perpetual licence: distinct functional IP, largely point in time. "The pivotal fact is control of the weights." | No |
| 02 | "I bill per resolved ticket / per successful action — how do I recognize revenue I only earn if the agent succeeds?" | $4 per ticket resolved without escalation; new logo could land anywhere from 20% to 70%; CRO wants full-year estimate booked at signing | Variable consideration; allocation exception lets revenue follow each period's outcomes; forward booking rejected ("Bookings is a non-GAAP narrative; it cannot pull revenue forward"). "Build the outcome ledger… an auditable, immutable record… it is exactly what an auditor will vouch." | No (language is reusable) |
| 03 | "I resell third-party model tokens and GPU compute with a markup — do I report the gross billing or just my margin?" | Cost $0.60, price $0.90 per 1,000 tokens; $10M billings = $10M gross or ~$3.3M net | Control of the specified service → principal → gross. A bring-your-own-key tier would flip the model component to agent. | No |
| 04 | "Customers buy prepaid credit packs that expire — when do I recognize the credits they never use?" | $1,000 pack, 12-month expiry, 8% historical breakage | Recognise breakage pro rata with redemptions (factor 1,000 ÷ 920 ≈ 1.087), not in a lump at expiry; check escheat first. | No |
| 05 | "My billing dates don't line up with month-end — do I recognize usage I've delivered but haven't invoiced yet?" | Invoice through 20 March; usage 21-31 March; books close 5 April; next invoice 20 April | Accrue the stub in March as an **unbilled receivable**, estimated from the recent daily run-rate; reverse when the invoice generates; track estimate-to-actual variance. "A persistent bias in that variance is an audit flag." | **Yes** — deterministic |
| 06 | "I pay sales commissions on contracts with no committed term or volume — do I capitalize them, and over what period?" | 10% commission on first-year consumption, 2% after; month-to-month; ~4-year average customer life | Capitalise; because 2% is not commensurate with 10%, amortise over the ~4-year expected benefit, not the stated term. | No |

Section 05 opens: "This is the one that lands on the close calendar every single month."

## Pages 35-37: "How Maximor Closes the Execution Gap"

- "The accounting is knowable — your team can reach the right answer on any single contract. What breaks down is
  execution at scale… while producing the audit trail that proves your conclusions were deliberate, not accidental."
- "Rules engines break when judgment is required. Spreadsheets do not learn. And generic AI hallucinates its way
  through the Codification."
- Three principles of "autonomous finance":
  - **Self-learning** — "Grounded in your policies, not generalized guesses." Grounded in "your policy elections,
    historical memos, prior-period conclusions, and auditor comment letters." "Every recommendation traces to a specific
    authoritative paragraph or a precedent in your policy library — never an invented cite."
  - **Self-improving** — "Learning from every override." "…the platform learns the underlying pattern, not just the
    one-off correction." "The same mistake is never made twice. Override rates fall from ~30% in month one to under 5% by
    month six". (Marketing figure; no method given.)
  - **Self-escalating** — "Handles the ~80% of contracts where the analysis is clear…; escalates the remaining ~20%…
    with a structured handoff calibrated to your risk tolerance." "An escalation is a package: the provision that
    triggered it, the candidate conclusions, why it couldn't resolve, and the relevant cites and prior memos." It
    "routes a pre-drafted memo before revenue is booked."
- Closing: "…without requiring your team to grow linearly with your ARR."

## Our reading

1. **Copy the format, not the topic.** First-person controller question → numbers → decision tree → operational fix.
   It matches the close assessment's style. Open each act of the demo with a question in the controller's voice.
2. **Stay out of ASC 606.** Five of six questions need a revenue engine we do not have, and Maximor's strategist wrote
   the guide.
3. **Section 05 is the one buildable item**, and Maximor points at accruals three times: this section, the homepage
   rule "ACCRUE-01 · no invoice by Day 2 → accrue", and close-assessment question 8. Deterministic; suits the kernel.
4. **The three principles map onto our build**, and show where we add something:
   - Self-learning ↔ E5/J1/J2 plus quote verification. They promise "never an invented cite"; our kernel enforces it.
   - Self-improving ↔ replay, compile, earned autonomy. Their yardstick (override rate 30% → <5% over six months) is one
     we can show with counts: 12 approvals → 6 → 0 over three runs of one month. Their "learns the underlying pattern,
     not just the one-off correction" is exactly what a scope guards against: with us a one-off stays one-off, and a
     pattern needs three agreeing cases, a backtest and a person's approval.
   - Self-escalating ↔ our Slack escalation. **Action:** lay the card out as their four-part package (trigger,
     candidate conclusions, why unresolved, cites and prior answers).
5. **Ratios differ by workflow in Maximor's own material:** ~80/20 here (revenue contracts), 99/1 on the revenue page,
   98/2 in press. Supports reporting a partition rather than an auto-clear rate.
6. **Who they are courting:** AI-native, usage-priced companies (consistent with 7 of 13 blog posts). A usage-priced
   Northwind (billing in arrears, prepaid credits) would resemble their pipeline. It also suggests a SaaS-shaped
   short-pay reason, a customer disputing metered overage. That last point is our inference.
