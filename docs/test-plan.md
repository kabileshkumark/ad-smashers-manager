# AD Smashers Manager Test Plan

Use this checklist before major updates, Firebase deployments, or any change that touches sessions, payments, attendance, guests, app updates, or navigation.

## Required App Export Before Updates

Before making any app update, take a fresh export from the live app and keep it as the restore point for that change.

This export is required for every code, data, rules, template, version, or deployment update so session, attendance, payment, guest, and settings data can be restored if the change causes a mismatch.

If the update involves recovering, correcting, or migrating live app data, inspect the exported/current data first and present the exact findings or restore candidates to the user before applying any update.

## Automated Regression Command

Run:

```powershell
npm test
```

The test suite uses Node's built-in test runner and does not require extra packages.

## Current Automated Coverage

### Recurring Session Editing (Build 1.0.21)

- FR-SES-033: edit one occurrence or the Full series. This session is the default; Full series includes upcoming occurrences only, excluding past, in-progress and Completed / Payment Collection records.
- Existing Repeat controls display the saved schedule and are enabled for Full series. Scope changes preserve independently entered date values; series date shifts use the first upcoming occurrence as the reference.
- Extend Repeat Until without recreating cancelled gaps. Preserve the recurrence weekday after independent occurrence edits. New records have fresh IDs and empty attendance, payments, publication state and notes.
- Shorten a series or switch Weekly to Once only after explicit confirmation naming the empty future occurrences to cancel. Once keeps the first upcoming occurrence. Reject bulk removal of any occurrence with player, attendance, guest, notes, publication or financial history.
- Convert an upcoming one-time session to Weekly while retaining the original ID and roster. Past/completed conversions are rejected.
- Validate the entire edit before mutation: invalid/past dates, duplicate schedules, excessive ranges and recorded-payment financial-basis changes must leave all sessions unchanged.
- Preserve independent manual capacity, court fee and per-person rate unless explicitly edited/reset. Recalculate automatic values from court-hours and peak count. Preserve court numbers, organizer snapshots, unrelated series, existing IDs and retained history.
- Automated regression: 259 tests passed. Local browser QA covered single edit, full-series extension, scope from a later occurrence, shortening confirmation, Once/Weekly conversion, save/reopen and desktop/390px layouts. No new physical-device keyboard test is claimed.
- A private October 1 export replay preserved all 50 player balances, 25 past sessions and 130 receipts, including after backup reload. QA is localhost-only, with production connections blocked and real exports excluded from Git and Hosting.

### Booked Court Numbers (Build 1.0.20)

- FR-SES-032: each booking accepts explicit court numbers; the count must match Courts. All booking rows are numbered together or remain unnumbered for legacy compatibility.
- Reject invalid/non-positive/non-integer court numbers, duplicates within a row, and reuse of a physical court in overlapping bookings. Permit adjacent and overnight reuse without overlap.
- Preserve original booking rows, explicit court numbers, manually edited capacity, and independent recurring occurrences through save, edit, reload, JSON and Firestore serialization.
- Derive a numbered time breakdown without merging adjacent equal-count intervals when the physical courts differ. Fees still use court-hours and suggested capacity still uses peak count.
- Session cards, Courts view and published final-list templates show the recorded numbers. Shorter-lived courts show availability; changing sets with no single fixed mapping show Player Groups and the explicit schedule, without inventing court numbers or changing roster order.
- Number-only changes do not change the financial basis or require reversing payments. Time, count, fee and capacity changes retain their existing financial guards. Incomplete labels while typing or invalid imported labels cannot zero the calculated cost.
- Saved custom final-list templates retain their content and include the booking numbers once; poll copy is unchanged. Legacy final-list messages remain unchanged until court numbers are entered.
- Automated regression: 238 tests. Local browser checks covered add/remove booking rows, duplicate validation, save/reload, unchanged fee/rate/capacity, preview, and layouts at 320px, 390px and 1440px. No new physical-device keyboard test is claimed.
- The September 27 private export was replayed against the prior release: all 48 player ledgers, 35 session calculations, Dashboard finances and existing final lists matched. Adding only court labels preserved the financial results. No production writes were used for QA.

### Compact Individual Reminders (Build 1.0.19)

- One unpaid session produces only the title, dated charge, Amount Due, payment instructions and automated-message footer. No empty Contributions, duplicate name, member subtotal, From date or duplicate usage total.
- Multiple unpaid items retain the last-cleared-period scope, every usage line and Total Used. Multiple contributions retain attribution and Total Contributions.
- Carried Credit can leave either a smaller due or Credit Remaining; no payment request is shown when nothing is due. Guest places and shared funding retain their context.
- Group reminders, including one-member groups, retain the detailed layout. Full summaries and Advance summaries change only their shared footer wording.
- Preview and Copy Reminder produce identical text. Repeated generation does not mutate state or financial coverage.
- Local replay of the owner-provided export compares every player's balance and ledger totals against the prior release without production writes. Keep the export outside Git and Hosting.

### Core Regression Coverage

The regression suite in `tests/regression.test.js` loads the same browser JavaScript files used by the app and checks these critical rules:

- Session date routing picks the correct WhatsApp group:
  - Friday sessions use the Friday group.
  - Saturday sessions use the Saturday group.
  - Other days use the FlexiDay group.
- Repeatable court bookings:
  - reject equal-time bookings and combine valid overlapping additions,
  - support valid overnight sequences within 24 hours,
  - calculate fee from total court-hours,
  - derive the active-court timeline and peak court count from original booking rows,
  - suggest capacity from peak courts while preserving a manual capacity until reset,
  - preserve legacy single-allocation session capacity until edit,
  - persist original booking rows through Firestore value conversion,
  - include booking and capacity changes in the protected financial basis,
  - aggregate court-hours correctly on Dashboard.
- Court list ordering pins the Booking court first, then sorts normal courts alphabetically.
- Admin-added poll guests can exceed two guests while the poll vote label remains `I'm in +2`.
- Manual confirmed players who did not vote can have guests added without creating voter-list entries.
- Organizer free-seat logic still charges for organizer guests.
- Upcoming sessions do not affect player balances or pending payment totals.
- Player Balances ordering is:
  - due players first,
  - advance-credit players next,
  - clear players last.
- Saved payment groups can include named guests and keep those guest names in the group member summary.
- Post-game overpayments become Credit owned only by the payer.
- A payment-group payer's remaining Credit reduces the group's cash payable amount, is consumed before new cash, and is restored exactly if that group-payment transaction is deleted.
- Intentional Advance remains in the Advance section. After covering the payer's own dues, the remaining Advance covers active members of each saved payment group before the payer's Credit is used.
- The transaction trash dialog offers Reverse and Delete: both undo the exact financial effect; Reverse retains an audit row while Delete removes it. An already-reversed receipt offers Delete only. Migrated and adjustment records allow neither action.
- Activities support one or more unique payers whose positive contributions must equal the activity total.
- Activity allocation supports Equal, Manual, Percentage, and No. of Shares modes with exact-cent totals and invalid-input rejection.
- The Organizer selected in Settings is the settlement owner: a non-organizer participant's share above their contribution is Due, while a contribution above their share becomes player-owned Credit.
- Activity edits and deletion reconcile shares, existing receipts, derived Credit, saved-group coverage, histories, and Dashboard totals without losing cash audit records.
- Activity-generated Credit covers the owner's later personal due and eligible payment-group member due without entering a shared pool.
- Session selection keeps one scroll surface, so tapping a session arrow does not reset page scroll.
- Android WhatsApp links target WhatsApp Business.
- `package.json` is the version source of truth: npm metadata uses `version`, while the PWA technical build uses `appVersion`. `index.html`, `sw.js`, `manifest.webmanifest`, and `js/config.js` use the same `appVersion` for cache/update consistency.
- Firestore cloud sync uses the single state document with versioned commit saves:
  - loading records the cloud document version,
  - saves use the previous Firestore update time as a precondition,
  - first save only creates the document if it does not already exist,
  - stale saves are rejected and background retries stop after a conflict.

## Manual Smoke Checklist

After `npm test` passes, check these once in the app for larger UI or deployment changes:

- Sign in as the admin account.
- Open Sessions and select a lower session card; the page should not jump.
- Use Settings > Check for Update; the app should reload to the latest semantic release version.
- In a session:
  - add a confirmed player who did not vote,
  - add multiple guests for that player,
  - confirm the payment row includes those guests.
- Open a Friday, Saturday, and FlexiDay session WhatsApp icon; each should use its configured group.
- Open Payments:
  - due players should appear first,
  - players with positive Credit should appear after dues,
  - clear players should appear last.
  - for a group payer with remaining Credit and another member with a due, confirm the group shows the net cash payable amount,
  - apply the group payment and confirm Credit is used before cash, the member due clears, and payment history records the Credit used.
  - for a group payer with intentional Advance, confirm the payer's own dues are covered first, member dues are then covered, the individual and group rows agree, and the payer's Advance history names member deductions.
  - use Reverse on a test receipt and confirm the reversed audit row remains; then delete that reversed row and confirm every balance remains unchanged,
  - use Delete on another active test receipt and confirm its financial effect is undone and no audit row remains.
  - at 320 px and 390 px widths, confirm each Payment Group name remains on one line, all five actions stay in the top-right row, the status chip sits below, and the empty amount field shows only a faint `0` placeholder.
- Open Activities and create a test activity:
  - select two or more payers and confirm payer amounts must equal the activity total,
  - switch through Equal, Manual, Percentage, and No. of Shares using the four icon controls,
  - confirm all four icons stay in one row at 320 px and 390 px,
  - verify an under-contributing non-organizer shows Due and an over-contributing non-organizer shows Credit,
  - edit the total, payer contributions, participants, and split; confirm balances and history recalculate,
  - delete the test activity; confirm derived balances are removed and any retained receipt cash becomes Credit.
- Create or edit a session with 2 courts from 7-9 PM and an additional court from 7-8 PM:
  - confirm the summary reports 5 court-hours,
  - confirm the card derives `3 → 2` with 7-8 PM and 8-9 PM breakdowns,
  - reopen Edit Session and confirm the original two booking rows remain unchanged,
  - manually change capacity and confirm later booking edits do not replace it,
  - reset capacity and confirm it returns to peak courts multiplied by Players per Court,
  - confirm the suggested court fee is the venue hourly rate multiplied by 5,
  - confirm the court-booking message includes the allocation breakdown and 5 total court-hours,
  - add and remove a booking at mobile width and confirm controls remain fully visible without horizontal overflow.
- Verify bottom navigation remains visible and usable on mobile.
- Verify no page zoom is possible in the installed PWA.

## When To Add More Tests

Add automated tests whenever a change affects:

- session payment calculation,
- activity payer, split, edit, deletion, or settlement calculation,
- guest or attendance behavior,
- advance payment handling,
- session stage/status automation,
- WhatsApp link generation,
- app update/cache versioning,
- scroll preservation,
- import/export or Firestore migration.
- Firebase REST cloud sync or single-document save behavior.
