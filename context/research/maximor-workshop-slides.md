# Maximor workshop at HackMIT — slide notes

Source: eight photos Karan took in the room, Sat 19 Sep 2026, 4:24-4:30 PM ET (IMG_2270-2277). Slide footer reads "Maximor x HackMIT · Sept 19, 2026". Transcribed from the photos; text hidden behind the presenter is marked.

## 1. FINANCE BREADTH — "Finance is not one workflow"
"The same judgment layer spans many functions."
- Close: Are the books complete?
- Cash: Will we run out of money?
- AP: Should this invoice be paid?
- AR: Will this customer pay?
- Revenue: When did we earn it?
- Treasury: Where should cash sit?
- Tax: What do we owe, where?
- (one box hidden, ends "...ext?")
- **Controls: Can we prove it?** (highlighted)
- Audit: Would a third party trust it?
Bottom line partly hidden.

## 2. COMPLEXITY — "Why the complexity explodes"
"Complexity multiplies because humans and traditional software hits a wall."
Entities (US · EU · APAC) -> Systems (ERP · CRM · banks · billing · payroll) -> Artifacts (Excel · PDFs · emails · Slack · tickets) -> **Judgment (materiality · policy · precedent)** (highlighted)
"complexity ≈ entities × systems × [hidden] × policies × exceptions × time"

## 3. MAXIMOR IN 20 SECONDS — "What Maximor does"
"We run finance judgment on top of the systems companies already own."
contracts · spreadsheets · emails · ERPs
"Not a chatbot. Not a replacement ERP. A judgment and execution layer for finance."

## 4. EXAMPLE — "Concrete example: one revenue contract"
"The hard part is not reading the PDF. It is updating reality correctly."
Contract PDF, 470 pages -> CRM says $22.3M ACV -> Workbook says $2M / month -> ERP has a single journal entry -> **Auditor asks "why?"**
"The model cannot merely 'understand the contract.' It must update financial reality and leave a trail a human can trust."

## 5. THESIS — "The algorithm was never written down"
"The real 'program' is distributed across the company's history."
"Where is the policy?" Accounting memo · Prior close files · Reviewer comments · Emails · ERP history
"All of them. And none of them."
**"The source code doesn't exist. The execution traces do."**

## 6. MECHANISM — "Replay before you run"
"You cannot safely automate the future before you can explain the past."
1 · Reconstruct: What did the human know? -> 2 · Replay: Hide the answer. Re-run the close. -> **3 · Compile: Repeated judgment -> policy** (highlighted) -> 4 · Verify: Post, escalate, or learn
"Inference is expensive freedom. Once you learn the rule, compile away as much freedom as possible."

## 7. VERIFICATION — "What is pytest for finance?"
"Coding agents got good partly because code can be verified at runtime. Finance needs its own runtime signals."
- Do debits = credits?
- Does subledger reconcile to GL?
- Does revenue schedule sum to contract value?
- **Was source evidence checked?** · **Was policy followed?** · **Should this escalate?** (highlighted)
"An answer without evidence is not an answer."

## 8. RELIABILITY — "In consequential workflows, 95% can be zero"
"One wrong step can corrupt downstream state." "80 decisions in one close." **0.95^80 ≈ 1.65%**
"You do not get reliability by asking the model to be a little smarter."
restrict degrees of freedom · **verify at runtime** (highlighted) · escalate exceptions · learn from review

## 9. OPEN QUESTIONS — "Open question #1: what is Lean for finance?"
"Can messy economic work become progressively checkable?"
"Lean works because proofs are explicit objects. Finance has proofs too — but they are scattered across evidence, reconciliations, approvals, and policy."
Formal checks (debits = credits) · Evidence checks (source linked) · **Process checks (review path followed)** (highlighted) · Judgment checks (policy applied)
"Can we make messy work legible without pretending it is clean math?"

## 10. OPEN QUESTIONS — "Open question #2: can agent costs compress with scale?"
"Naive automation gets more expensive as usage grows. Great systems get cheaper as they learn."
Naive automation: more customers -> more tokens -> more humans -> more cost
What we actually want: "every deployment teaches policies, tests, tools, and abstractions that make the next deployment cheaper"
model routing · **policy reuse** (highlighted) · tool caches · compiled checks · escalation loops

## 11. OPEN QUESTIONS — "Open question #3: intent should be first-class state"
"Today software often preserves the artifact and loses the reason it exists."
Current software often stores the final artifact -> **But agents need the user's intent** -> So future work can compound correctly
"Not just: 'Here is the spreadsheet.' Also: 'Here is the question this spreadsheet was trying to answer.'"

Speaker: per Karan, who was in the room, the talk was given by Maximor's CTO (Ajay). Company research lists the CTO as Ajay Krishna Amudan. The screen share also shows a Zoom active-speaker label in small type; it names whoever was speaking on the call and is not used here to identify anyone.
