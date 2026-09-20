import { ACCOUNT_NAMES } from "../contract/accounts.js";

/** Accounts the seeded history needs beyond the contract's chart. Codes are B-lane only; the kernel never names them. */
export const SEED_ACCOUNTS = {
  equity: "3000",
  hosting: "5000",
  software: "6100",
  professional_fees: "6200",
  marketing: "6300",
  office: "6400",
  unrealized_fx: "7150",
} as const;

const SEED_ACCOUNT_NAMES: Readonly<Record<string, string>> = {
  "3000": "Common stock and APIC",
  "5000": "Hosting and infrastructure",
  "6100": "Software subscriptions",
  "6200": "Professional fees",
  "6300": "Marketing",
  "6400": "Office and facilities",
  "7150": "Unrealized FX gain/loss",
};

export function accountName(code: string): string {
  return ACCOUNT_NAMES[code] ?? SEED_ACCOUNT_NAMES[code] ?? code;
}
