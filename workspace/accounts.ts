import { ACCOUNTS } from "../src/contract/accounts.js";

/** Cash and the receivable are where every entry lands; the account that says WHY is the other one. */
const CONTROL = new Set<string>([ACCOUNTS.cash, ACCOUNTS.ar]);

export function isControlAccountCode(account: string): boolean {
  return CONTROL.has(account);
}
