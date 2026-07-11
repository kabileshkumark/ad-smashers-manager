# Data Classification

## Classification

Overall application data classification: High.

Repository source classification: Public after an exposure audit. Public source does not change the classification of runtime data.

## Data Inventory

| Data | Sensitivity | Stored Where | Retention | Notes |
| --- | --- | --- | --- | --- |
| Source code and static assets | Public | GitHub | Indefinite | No live data or credentials. |
| Firebase web-client identifiers | Public | Source/build/browser | Indefinite | Browser configuration, not an admin secret. |
| Player names and phone numbers | High | Authenticated Firestore | While operational; review annually | Never commit or attach to public issues. |
| Session attendance and guests | High | Authenticated Firestore | While operational; review annually | Personal participation data. |
| Payment, advance, and activity ledger | High | Authenticated Firestore | While operational and for reconciliation | Financially sensitive operational data. |
| Auth and refresh tokens | Critical | Browser session/local storage | Session/token lifetime | Never log, export, or commit. |
| JSON/Firestore backups | High | Local protected backup location | Per release/retention policy | Ignored by Git; access limited to owner. |

## Access Rules

- Who can read: authenticated active AD Smashers members according to Firestore role rules.
- Who can write: owner, admin, and editor roles according to Firestore rules.
- Who can export: owner/operator using authenticated app or controlled scripts.
- Who can delete: authorized roles through confirmed workflows; member administration is owner-controlled.

## Backup Requirements

- Backup frequency: before deployment, migration, rules change, or high-risk data operation.
- Backup location: local protected workspace backup directory outside Git.
- Restore method: authenticated import script or in-app JSON restore after validation and rollback review.

## Privacy Notes

- Public repository visibility applies only to source and documentation.
- Never use real player, contact, payment, or session data in tests, screenshots, issues, or pull requests.
- Public commit history exposes commit authorship; use the GitHub no-reply commit email.

## Security Requirements

- Firebase Authentication and member-gated Firestore rules are mandatory.
- Public source is treated as fully known to an attacker; security must not depend on hidden code or Firebase client identifiers.
- Secret/history scan is required before a visibility change and before each release.
- Force pushes, branch deletion, and direct changes to protected `main` are prohibited.
