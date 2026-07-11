# Security Policy

## Supported Version

Version 1.0 is the current supported baseline while release preparation is active.

## Report A Vulnerability

Use GitHub's private vulnerability reporting from the repository Security tab. Do not include vulnerability details, credentials, personal information, backups, or production records in a public issue or discussion.

Include:

- affected file, workflow, or deployed surface
- reproduction steps with synthetic data
- potential impact
- suggested mitigation, when known

There is no public response-time SLA for this personal project. Confirmed high-impact findings will block release until resolved or explicitly accepted by the owner.

## Public Repository Boundary

The repository may contain public Firebase web-client identifiers and Firestore rules. It must never contain passwords, auth/refresh tokens, private keys, service-account files, live exports, player contact details, payment records, or recoverable backups.
