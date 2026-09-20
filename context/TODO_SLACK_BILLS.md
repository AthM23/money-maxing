# For Karan: DM uploaded bills to Slack, ~20 minutes

Uploaded bills (pipeline page → `upload_bill` action) now wait in Input needed with Accept/Reject
(`bill_review` action). Wiring them into the desk so the approver also gets a Slack DM:

1. `src/desk/deskPass.ts`: after the parked loop, select open uploaded bills not yet posted
   (`SELECT ... FROM bill WHERE status='open' AND id LIKE 'BILL-UP-%'`), pick the approver with
   `chooseApprover` sized by `total_cents`, post via a new `poster.postBill(bill_id, slack_user)`.
   Bills have no `slack_ts` column: track posted ids in a Set like `postFactCandidates` does.
2. `src/agents/slack/transport.ts`: add `postBill` (blocks: vendor, ref, amount, bill date, the
   triage line from prior-bill history, Accept / Reject buttons) and a click handler that runs the
   same status update as `workspace/actions.ts` `bill_review` (open → approved | void). Factor that
   into a shared helper if you prefer; it is 6 lines of SQL.
3. Nothing else: the queue page reads live state, so a bill accepted from Slack disappears from
   Input needed on the next refresh, and the toast copy is already truthful ("accepted for the
   payment run", nothing posts to the ledger).

Untestable from Preet's laptop (no SLACK_* tokens in a local .env), which is why it stops here.
