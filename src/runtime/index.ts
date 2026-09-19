export { openDb, type Db } from "./db.js";
export { proposeEntry, type ProposeMeta, type ProposeResult, type RuntimeDeps } from "./proposeEntry.js";
export { approveDecision, type ApprovalInput, type ApproveResult } from "./approve.js";
export { emit } from "./events.js";
export { DEFAULT_CONFIG, systemClock, type Clock, type RuntimeConfig } from "./config.js";
export { readControlTotals } from "./kernelContext.js";
