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
- Intentional Advance remains in the Advance section and does not transfer to other payment-group members.
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
  - at 320 px and 390 px widths, confirm each Payment Group name remains on one line, all five actions stay in the top-right row, the status chip sits below, and the empty amount field shows only a faint `0` placeholder.
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
- guest or attendance behavior,
- advance payment handling,
- session stage/status automation,
- WhatsApp link generation,
- app update/cache versioning,
- scroll preservation,
- import/export or Firestore migration.
- Firebase REST cloud sync or single-document save behavior.
