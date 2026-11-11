# Glossary

Domain vocabulary for `ledger-core`.

## Terms

- **Account**: An identified bucket categorised as an Asset, Liability, Equity, Income, or Expense. Belongs to one **Entity**, holds one **Currency**, and may roll up into a **Header Account**.
- **Account Type**: One of `asset`, `liability`, `equity`, `income`, `expense`. There is no sixth type: opening balances are posted against ordinary `equity` accounts.
- **Normal Balance**: The side on which an Account Type normally grows. **Debit** for `asset` and `expense`; **Credit** for `liability`, `equity`, and `income`.
- **Entity**: The legal/accounting body that owns an Account (`entityId`, `"default"` if omitted). A Transaction must balance within each Entity separately.
- **Chart of Accounts**: A validated set of Accounts. Every parent exists, shares its child's Entity and Account Type, and the hierarchy has no cycles. A Header Account may use a different Currency from its children. Produced only by `createChartOfAccounts`; read-only afterwards.
- **Header Account** (summary): An Account named as another Account's `parentId`. It only aggregates; nothing may be posted to it, and its **Header Rollup** is per Currency, not one amount.
- **Header Rollup**: The sum of a Header Account's descendant Leaf Accounts' Balances, per Currency, up to and including a date. The Currency is a descendant's, which need not be the Header's own. Every Header Account has one, and it covers the whole subtree below it.
- **Header Period Rollup**: The sum of the Postings dated inside an inclusive period on a Header Account's descendant Leaf Accounts, per Currency, with the same rows as a **Header Rollup**. For an Income or Expense Header it is the figure for the period; for an Asset, Liability or Equity Header it is net movement, not a Balance, and equals the Header Rollup at the period's end minus the Header Rollup at the day before its start.
- **Leaf Account** (detail): An Account no other Account names as parent. Postings target Leaf Accounts only.
- **Descendant Leaf Account**: A Leaf Account reached from an Account by following `parentId` links transitively. A Header Account's subtree is the set of them.
- **Currency**: An ISO 4217 alphabetic code (`THB`, `USD`, `JPY`). Its **Minor Unit** precision comes from the runtime's `Intl` data (THB 2, JPY 0, KWD 3, CLF 4).
- **Minor Unit**: The smallest division of a Currency (satang, cent, yen). All amounts are stored as safe integers of Minor Units; floats never enter the model. `toMinorUnits` / `fromMinorUnits` convert at the boundary.
- **Posting**: One signed, non-zero amount in one Currency against one Leaf Account, optionally tagged with **Dimensions**.
- **Debit / Credit (sign convention)**: A Debit is a **positive** Minor Unit amount; a Credit is a **negative** one. A Posting's sign never depends on the Account Type; Normal Balance only says which sign is "usual".
- **Transaction**: A set of at least two Postings, dated with an **ISODate**, whose amounts sum to zero for every `(Entity, Currency)` pair. Debits equal Credits. An unbalanced Transaction cannot be constructed.
- **ISODate**: A real calendar date `YYYY-MM-DD`. No time of day, no timezone.
- **Dimensions**: Non-empty string key/value tags on a Posting (cost centre, project, class) for cost accounting.
- **linkedTo**: A Transaction's pointer to the earlier Transaction it reverses or amends. Ledgers are append-only: corrections add Transactions, they never edit old ones.
- **Simple Entry**: A Transaction with exactly two Postings, one Debit and one Credit. Built by `simple`. _Avoid_: transfer, `from`/`to` legs.
- **Compound Entry**: A Transaction with three or more Postings, at least two of them on one side. Built by `compound`. _Avoid_: split.
- **Reversal**: A Transaction whose Postings are the exact negation of an earlier Transaction's, in the same order, linked to it. Correcting a Transaction never edits it: a Reversal is a new Transaction. In every report it counts in the period of its own date, not its original's. _Avoid_: void, delete, cancel.
- **Amendment**: A Reversal paired with the Replacement Transaction that carries the corrected figures. The original stays, so the ledger shows what was recorded, what withdrew it, and what replaced it. _Avoid_: edit, update.
- **Opening Balance**: The balance an Account starts the ledger with, posted against an Equity Account so the ledger still sums to zero. _Avoid_: initial amount.
- **Balance**: The accumulated sum of Postings for an Account up to and including a date, as a signed amount (Debit positive, Credit negative), whatever the Account Type.
- **Net Worth**: Total Assets minus total Liabilities up to and including a date, per Entity and Currency, shown as a positive number when assets exceed liabilities. Equity is not part of it.
- **P&L (Profit and Loss)**: Income minus Expenses over an inclusive period, per Entity and Currency, shown as a positive number when income exceeds expenses.
- **Trial Balance**: Every Leaf Account's Balance at a date, each placed in the Debit column if positive and the Credit column if negative, with column totals per Entity and Currency. The two totals always match.
