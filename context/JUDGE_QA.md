# The hard questions, and the honest answers

Written 20 Sep 2026, 03:45 EDT, from three reads of the repository in the voice of a controller, Maximor's CTO and an
investor (00:20), checked again against the code as it stands now. "Not built" is an answer; say it without a wince.
The sentence to land, whoever asks: **"Of the $4,200, $2,000 was arithmetic we re-performed and $2,200 was authority;
the system knew the difference, asked one person once, and the kernel let nobody blur the two."**

## What a finance person will ask

| Question | Answer |
|---|---|
| The euro strengthens instead. What posts? | The cash, and nothing else. A $25 fee and a $10 gain look like "$15 short", and until 03:40 tonight the short-pay rule swallowed that: we reproduced it, and closed it twice over (the code tier leaves a converted receipt it cannot split to a person; kernel check F10 refuses a rule-backed write-off that is not exactly the bank's fee). **Gains are not booked at all: losses only.** |
| The invoice is dated June, paid in July. Where is the 30 June remeasurement? | Not built. It appears only as seeded history. F9 uses the booked rate, which is right only if the revaluation reverses on day one. |
| Where does the booked rate 1.1000 come from? | A number on the invoice's FX record with no source, rate type or date. Only the settlement rate is agreed to the bank's advice. Not built. |
| Is the $40 agreed to the advice, or a plug? | Agreed. The quote is the bank's labelled line ("Bank charges deducted USD 40.00"); a figure only counts if it stands as its own figure ("40.00" inside "105,840.00" does not); and F9 ties EUR 98,000 × 1.0800 − 40.00 to the bank line to the cent. All three were weaknesses at midnight and have tests now. |
| $1,960 posts with nobody involved and $550 waits. What does my auditor say? | The $1,960 is arithmetic re-performed from two records and the cited advice, once per receipt; a wrong amount, a wrong account, a second booking and an uncited advice are each refused in a test. The $550 is a concession, which is judgment: that kind of entry has not earned the right to post alone, and $500 or more needs a person anyway. |
| The contract says an officer confirms a credit in writing. What stops the account manager answering? | Only partly what you would want. An answer carries the answerer's approval limit and never covers a later, larger case; preparer and approver are kept apart. There is **no rule that a credit needs an officer's role**. In the demo the CFO decides. |
| Why debit deferred revenue for a June outage? | The policy memo in the world says so. Splitting earned from unearned revenue is not built; the revenue engine looked at the memo, left the schedule alone and said a person has to look (it is on the case page). |
| The same customer withholds 2% in August over something else? | Memory would prepare the credit: the scope is customer, kind of entry, dates and exactly 2%; the reason and the service period are not compared. It parks for a person. That is a limit. |

## What an engineer will ask

| Question | Answer |
|---|---|
| Was that a model or a script? | On the demo database: Claude Haiku 4.5, 24 calls, $0.10, 98 seconds, logged. In the test suite: stand-ins, and the trace labels them "scripted stand-in, not a model". |
| What happens when the model is wrong? | Tonight, for real: our prompt told the models a dispute hold credits AR. Three tiers drafted seven entries that way; the kernel refused all seven. **$1.38 wasted, $0 misposted.** An entry a model reached without an approved rule or a remembered answer never posts alone, even on a kind that has earned it. |
| "0 model calls on run 2": because none was offered? | In that test, yes, by construction. The honest claim is "with the models unplugged, six of ten settle from code, three are prepared from memory and wait, one is held". The evidence that is not circular is the add-on invoice: a new receipt, a week later, prepared from one remembered answer. |
| Replay went 0 of 9 to 8 of 9. Replaying what? | The code tier alone, so 0 is what no rule gives you, and 8 of 9 is in-sample. Leave-one-out is reported beside it (6 of 8). History is nine decisions we authored. |
| Is "compiling a policy" induction? | One template: kind, account, payment method, at least three agreeing human decisions, the ceiling and the customers actually observed. A draft that would disagree with any past decision is refused. |
| Who read the bank's advice? | Nobody: the FX records are part of the seeded world. The kernel makes the advice state the amount and the rate as labelled figures and ties the arithmetic to the bank line, but no model reads an advice on the demo path. |
| What does your fine-tune do in the product? | It reads documents into a schema, and code decides whether to believe it. Through our real kernel and ledger on 200 held-out remittances: ours 168 settled and 32 left for judgment, which is what perfect labels reach; the untouched model 0; a deliberately wrong reader 0; **wrong postings 0 in every row.** It is not on the demo path, on purpose. |
| Isn't base Qwen a strawman? | It is the floor, and it is labelled as that. The comparison that matters is on the same chart: four Claude models with the whole schema in every prompt, on the same 120 documents (slice checked by SHA-256). The strongest, Opus 4.8, reaches 0.958 field-F1 and 66.7% exact; ours is 0.972 and 70.0% with no schema in the prompt. An earlier API run had drifted off the slice (9 documents overlapped); it was re-run at 05:17 and the Claude rows dropped 2 to 3 points. |
| What does it cost at scale? | Measured: 14 entries by code for $0, one judgment case for $0.10, a worst case of $1.38. Not measured at volume, and rules are scoped to the customers they were seen on, so there is no reuse across customers yet. |
| Is this safe to post to a real ledger? | No, and we say so in the README. Reviews on 19 Sep found six ways an entry could post without a person; tonight we found one more ourselves. All are closed with a test that fails without the fix. We expect there are more: it is a property we keep attacking, not one we proved. |

## What an investor will ask

| Question | Answer |
|---|---|
| Maximor's CTO called cash the easy function. Where is the hard part? | Separating arithmetic from authority, and proving it. The kernel refuses the whole $4,200 booked as FX, FX booked to the wrong account, and a fee booked as a concession. |
| This is the loop on Maximor's home page. What is yours? | A mechanism, not a claim: every entry is re-performed by plain code, not by a second model, and an auditor's pack re-performs it again without being able to read the preparer's memory. |
| What would you cut? | The ten-receipt tour, AP, the long benchmark table. Keep the wire, one refusal, the add-on invoice nobody was asked about, and the auditor's one changed digit. |
