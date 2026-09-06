# Player Lifecycle

Introduced with Version 1.0, technical build 1.0.14 (ADS-20).

## Active Directory and Financial History

Directory removal is archival, not financial erasure. `playerIsSelectable` excludes entries carrying `archivedAt` from active directory lists and new selections. Historical ledger processing keeps the identity eligible; changing the old `active` flag would remove historical charges and incorrectly reallocate funds.

The delete confirmation checks the canonical ledger for the selected player's own Due, remaining Advance, remaining Credit and upcoming reserved payments. Every balance must be zero. Membership of a payment group is not a blocker, and another member's due does not prevent removal.

## Preserved Records

- Keep attendance, guests, charges, activity participation, contributions and split values.
- Keep receipt and reversal history, consumed funding sources and the original payer's ownership.
- Keep historical payment-group links, including the payer identity. Archiving must not silently replace a group payer or redistribute prior coverage.
- Preserve session role snapshots and historical organizer-relative activity responsibility. Clear an archived player's current Settings role without changing past exemptions.
- Keep finance and attendance reporting based on retained ledger identities. If a later correction or reversal reopens a balance, show it in Payments and identify the reopened settlement under Removed players.

## Recovery and Persistence

Removed players remain accessible through the collapsed Removed players section, with payment history and Restore actions. Restore re-enables the same identity without copying or modifying financial records and does not automatically reassign a Settings role.

Existing historical activities retain archived participants and payers in their editor. Newly created activities and session selection lists exclude them. Existing payment-group references remain available to preserve history.

The existing structured cloud storage uses the `archivedPlayers` collection for archived directory entries. Reload, export/import and subsequent saves must retain `archivedAt`, identity, contributions, shares, groups, receipts and canonical coverage. No bulk production migration is needed.

## Regression Gates

- Permit a settled individual, settled group member and fully consumed group-funding payer to be archived without changing any other balance.
- Reject separate Due, unused Advance, Credit and reserved-payment cases without mutation.
- Preserve financial and dashboard snapshots before/after archival, backup roundtrip and structured cloud save/load.
- Keep historical activity editing and role-covered totals intact.
- Reopen visibility after payment reversal; restore the same player identity.
