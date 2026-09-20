/** Chart of accounts (spec §3). DRAFT: codes only; names are for display. Shared by the engines and the kernel. */
export const ACCOUNTS = {
  cash: "1000",
  ar: "1200",
  prepaid: "1300",
  wht_receivable: "1350",
  ap: "2000",
  customer_credits: "2100",
  accrued_liabilities: "2200",
  deferred_revenue: "2400",
  subscription_revenue: "4000",
  concessions: "4900",
  bank_charges: "6150",
  misc_expense: "6990",
} as const;

export const ACCOUNT_NAMES: Readonly<Record<string, string>> = {
  "1000": "Cash",
  "1200": "Accounts receivable",
  "1300": "Prepaid expenses",
  "1350": "Withholding tax receivable",
  "2000": "Accounts payable",
  "2100": "Customer credits",
  "2200": "Accrued liabilities",
  "2400": "Deferred revenue",
  "4000": "Subscription revenue",
  "4900": "Discounts and concessions",
  "6150": "Bank charges",
  "6990": "Misc expense",
};
