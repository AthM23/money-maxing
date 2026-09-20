# Judge Feedback v2 — 2026-09-19 (evening)

Second round of feedback from the judges, after they saw where the build is heading. Relayed by Atharv from
memory the same evening; his note is reproduced verbatim at the bottom. It follows the first conversation in
[`judge-interview-2026-09-19.md`](./judge-interview-2026-09-19.md) and **narrows** it: v1 said what to build,
v2 says how it will be judged when shown.

> Sections 1-4 are what the judges said, as relayed. Section 5 onward is **our reading and a proposal**, not
> something a judge said. Nothing here has been agreed by the team yet.

---

## 1. The headline: do not be generic

The single biggest takeaway. A system that "does finance ops" in general will not land. Pick a specific thing
and go deep on it.

- **The demo is a story, start to finish.** A large share of the score rides on the storytelling, not on the
  feature list.
- The story must be a **pain point that people really face**, recognisable to someone who works in finance, not
  an invented scenario that exists to show off a feature.
- **Fake data is fine. Unrealistic data is not.** Seeded companies, invoices and emails are expected; they have
  to look like the real thing.

## 2. Depth over breadth

- If every finance process works, good, say so ("we also did this").
- But **prioritise two or three key processes and make them excellent for the demo.** Better three that are
  convincing than eight that are thin.

## 3. Anchor the story in Maximor's actual customers

- Go through the company's **real customers**.
- Research the **finance pain points those companies face**, and which of them **Maximor is solving**.
- Get **at least two or three**, so that the recorded demo walks through *those exact pain points* rather than
  something generic.

## 4. Fine-tuning and a benchmark of our own

- They **liked the fine-tuning idea**.
- They recommended **creating our own benchmark** and using it to drive and measure the system.
- Go through **AccountingBench**, which is already in the reference points of the Maximor track doc
  ([`research/maximor-track-brief.md`](./research/maximor-track-brief.md), "Reference points").
- The result they would find most impressive: something in that spirit, run with **our fine-tuned model**,
  compared against **open-source base models**, showing **how much better the fine-tuned one does**.

---

## 5. What this changes (our reading, proposed)

| Before | After this feedback |
|---|---|
| Ambition shown through breadth: eight functions on one judgment layer (spec §3) | Breadth becomes a closing line. The five minutes go to **2-3 processes told as one customer-shaped story** |
| Demo spine chosen for technical reach: one event rippling through five functions (spec §4) | Spine chosen because **a named kind of customer has exactly this problem**, and said so on screen |
| Fine-tune is a stretch, fourth on the cut list, reported in shadow (roadmap) | Fine-tune **plus a benchmark** is a headline result: our model vs base open-weight models on our benchmark |
| Eval = the 115-case corpus, scored by route | Keep it, and add a **benchmark with a name, a held-out split and a comparison table** |
| Pain points are sourced industry statistics ([`research/finance-pain-points.md`](./research/finance-pain-points.md)) | Pain points are **specific customers' problems**, with the statistic as support |

What does **not** change: full autonomy with a human pulled in only on a genuine blocker, the answer remembered
with its scope and never asked twice, the deterministic kernel, and one ledger where the same transaction means
the same thing everywhere. Those came from the first interview and nothing in v2 walks them back.

**Tension to settle, not settled here.** The first interview scored *ambition* as cross-function over
single-function, and the track doc calls several agents across functions "the stretch goal". v2 does not
contradict that: it says to *show* two or three deeply. The build can stay cross-function underneath. What has
to change is what the demo spends its time on.

## 6. Where the build already fits, and where it does not

What already exists (Phase 1, [`PROJECT_STATUS.md`](./PROJECT_STATUS.md)) against Maximor's customers as we
know them today ([`research/maximor-company-intel.md`](./research/maximor-company-intel.md) §3). This is a
first mapping from material already in the repo; the customer research in §7 is meant to confirm or replace it.

| Customer evidence we hold | The pain, as stated | What we have that speaks to it | Gap |
|---|---|---|---|
| **Kiteworks**: "Automates 98% of Cash Transactions with Maximor" (case-study title only; body not retrieved). An unnamed global cybersecurity company cut its cash-recon team from 20 to 5 in under four weeks | Cash application and bank reconciliation done by people, at volume | Bank line → drift → intent → tier 0 → kernel → ledger. 6 of 11 July receipts clear with zero model calls; the rest are partitioned, not guessed | We have 11 receipts, not volume. One payment for three invoices, the duplicate refund and the $12.40 are not built yet |
| **Rently**: close from 11 to 3 days (sources conflict: also 8 to 4), $350K saved, two hires avoided | The close takes too long and needs more people | Nothing yet beyond the ledger tying out. Close conductor, accruals and tie-outs are Phase 2-3 | The whole close story |
| **Dura Software** (multi-entity holding company): *"You're buying back your team's judgment"*, *"takes responsibility for the whole workflow, not just the task"* | Judgment is the scarce thing, and it is spent on repeat questions | Initech (the reason is in a CEO email), Wayne (nothing explains it: ask once, remember with scope), wire fees learned from how humans booked Q2 | Multi-entity is out of our scope. The *judgment* half fits well |
| **PE-backed roll-up** (unnamed): audit findings from 7 to 0 in six months | Entries that cannot be defended at audit | Every entry carries a workpaper with four classes of tick mark that the kernel re-performs; change one character of a quoted email and it rejects | The audit pack itself is not built |
| **Invst** (wealth management): 4-day close, audit-ready schedules | Schedules and reconciliations rebuilt by hand each month | Little. Revenue schedules are Phase 2 | Advisor-level revenue is specific to wealth management; we should not pretend to it |

**Proposed candidates for "the two or three"**, to be confirmed by §7:

1. **Cash application that knows when it does not know** (Kiteworks / the cybersecurity company). The realistic
   pain is not matching the easy 90%; it is the payment that arrives short, from the wrong entity, or with no
   reference, and sits in unapplied cash until someone chases it.
2. **The reason lives in somebody's inbox** (Dura's "buying back judgment"). The short-pay that only the CEO's
   email explains, and the one nothing explains, which is asked once and then never again.
3. **An entry you can defend** (the roll-up's audit findings). The workpaper, the kernel, the mutation test.

All three are one story on one customer, which is what §1 asks for.

## 7. To do because of this feedback

- [ ] **Customer pain research**: real customers, their stated problems, what Maximor claims to fix, sources for
  each. In progress: `research/customer-pain-points-and-accountingbench.md` (being written; not yet reviewed).
- [ ] **Pick the two or three** and rewrite the demo script (spec §12) around them. Owner: both. Needs a decision.
- [ ] **Study AccountingBench** and the other five reference points: what is public, how they score, what we can
  reuse. Same research file.
- [ ] **Define our benchmark**: tasks, n, held-out split by entity, metrics that charge more for a wrong auto-post
  than for an unnecessary escalation. Lane C already has a synthetic generator and a harness on `main` (commits
  `fdc01c1`, `3356c85`; not merged into `atharv-branch` as of this note). Decide whether that harness *is* the
  benchmark or feeds it.
- [ ] **The comparison table**: fine-tuned model vs the same base model vs one or two other open-weight models,
  on the held-out set, with n. Report the unflattering numbers too.
- [ ] **Realism pass on the seed**: the 12 modelled customers bill $172k a month, which is not a $60M company.
  Either scale the world or say plainly that it is a slice. Names, amounts, email tone and bank descriptors
  should read like the customer we pick.
- [ ] **Re-order the roadmap's cut list**: the fine-tune moves up; function packs that are not in the story move down.

## 8. Risks in following this advice

- A benchmark built tonight from our own generator, scored on our own model, is easy to make meaningless:
  leakage between the generator's train and test sides, a tiny n, or a badly prompted baseline. If the
  comparison is not honest it is worse than not having one.
- "Two or three processes" can slide back into "one demo path with everything else faked". The never-cut list
  in the roadmap still applies.
- The customer facts we hold are thin and partly conflicting (Rently's close numbers differ by source; the
  Kiteworks case study body was never retrieved; two customer names are unverified). Do not put a customer's
  name or number on a slide until §7's research has a source for it.

---

## Raw note (Atharv, verbatim, dictated)

> All right, so I want you to create, like, a new judge feedback Markdown file, like V2, I guess, in context folder. So basically, like, I think the biggest takeaway is, like, don't keep it generic. It's, like, the biggest part in all this is, like, the storytelling. And so, like, actually, like, storytelling, like, a pain point that is, like, realistic, you know, like in the real world that people face. I think another thing as well is, like, they really liked the kind of fine-tuning idea, and one thing they actually recommended is, like, creating our own benchmark and, like, kind of using that for the system. Also go through the accounting bench, which is already in the reference points of the Maximo Google doc. So they were telling that if we do something like that, but with our fine-tuned model, and then compare the open source models and our fine-tuned model and show how much better it works with the other open source model, that will be very sick. And so yeah, but yeah, like big thing is just, like, don't make it generic at all, like really hone in on a specific thing. So I think what we'll probably do then is, I mean, if we can get, like, all the different finance processes, that'd be great to, like, just be like, Hey, we did this. But I think we can probably prioritize, like, really just having, like, two to three really key, like, financial processes and, like really making it good for the demo. They said, like, obviously you can have, like, fake data, it's fine, but, like, make sure it's, like, I guess, relatively, like, realistic. And again, like, a lot of it falls on the storytelling part of it, from start to finish. Also go through the actual customers of the company, and, like, we have to actually research about the actual pain points in finance those companies faces, and those pain points are being solved by Maximo. So we have to at least get two to three, so that when we record the demo, we go through those exact pain points and not something generic.

"Maximo" in the note is Maximor. "Accounting bench" is AccountingBench.
