// Core chart of accounts for Northwind. The kernel and the engines refer to accounts by these constants;
// the seeder may add more rows to `account`, but never renumbers these.
// Changed only with both people in the conversation.

type AccountDef = {
  readonly code: string;
  readonly name: string;
  readonly type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  readonly control_for?: 'AR' | 'AP';
};

const a = <C extends string>(code: C, name: string, type: AccountDef['type'], control_for?: 'AR' | 'AP') =>
  ({ code, name, type, ...(control_for ? { control_for } : {}) }) as AccountDef & { readonly code: C };

export const ACCOUNTS = {
  CASH: a('1000', 'Cash - operating', 'asset'),
  UNDEPOSITED_PAYOUTS: a('1050', 'Processor clearing', 'asset'),
  AR: a('1100', 'Accounts receivable', 'asset', 'AR'),
  PREPAID: a('1300', 'Prepaid expenses', 'asset'),
  AP: a('2000', 'Accounts payable', 'liability', 'AP'),
  ACCRUED_LIABILITIES: a('2100', 'Accrued liabilities', 'liability'),
  ACCRUED_PAYROLL: a('2150', 'Accrued payroll', 'liability'),
  CUSTOMER_CREDITS: a('2200', 'Customer credits and unapplied cash', 'liability'),
  // A price concession on the remaining term debits this, not revenue (board README, accounting correction 1).
  DEFERRED_REVENUE: a('2300', 'Deferred revenue', 'liability'),
  COMMON_STOCK_APIC: a('3000', 'Common stock and APIC', 'equity'),
  RETAINED_EARNINGS: a('3900', 'Retained earnings', 'equity'),
  SUBSCRIPTION_REVENUE: a('4000', 'Subscription revenue', 'revenue'),
  SERVICES_REVENUE: a('4100', 'Services revenue', 'revenue'),
  HOSTING_COGS: a('5000', 'Hosting and infrastructure', 'expense'),
  PAYROLL_EXPENSE: a('6000', 'Salaries and wages', 'expense'),
  STOCK_COMP_EXPENSE: a('6050', 'Stock-based compensation', 'expense'),
  SOFTWARE_EXPENSE: a('6100', 'Software subscriptions', 'expense'),
  PROFESSIONAL_FEES: a('6200', 'Professional fees', 'expense'),
  MARKETING_EXPENSE: a('6300', 'Marketing', 'expense'),
  OFFICE_EXPENSE: a('6400', 'Office and facilities', 'expense'),
  BANK_FEES: a('6800', 'Bank fees', 'expense'),
  BAD_DEBT: a('6900', 'Bad debt and small-balance write-offs', 'expense'),
} as const;

export type AccountCode = (typeof ACCOUNTS)[keyof typeof ACCOUNTS]['code'];

export const ALL_ACCOUNTS: readonly AccountDef[] = Object.values(ACCOUNTS);
