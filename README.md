# AD Smashers Manager

AD Smashers Manager is a private-use badminton operations PWA for sessions, attendance, courts, payments, advances, shared costs, and WhatsApp-ready messages.

The source repository is public so GitHub Free can enforce pull requests, CI, linear history, and protected `main`. The application data is not public.

## Data Boundary

- No player directory, phone number, payment ledger, session record, backup, password, auth token, service-account key, or live Firestore export belongs in Git.
- Runtime data is stored in authenticated Firestore paths protected by `firestore.rules`.
- Firebase web-client configuration is intentionally present because it is delivered to every browser; it is an identifier, not an administrative credential.
- Local backups, generated hosting output, Firebase state, and login files are ignored by Git.

## Local Verification

```sh
npm test
npm run build
```

The build synchronizes the approved app version across the UI, service-worker cache, asset URLs, and manifest before preparing `firebase-public/`.

## Contribution Workflow

- `main` is the only long-lived branch.
- Use a short-lived Jira-linked `feature/`, `fix/`, `security/`, `docs/`, `test/`, `chore/`, or `hotfix/` branch.
- Open a pull request and complete the traceability/security/test checklist.
- Merge by squash after required checks pass, then delete the branch.

## Security

Do not open a public issue containing a vulnerability, credential, personal data, or production evidence. Follow [SECURITY.md](SECURITY.md) and use GitHub private vulnerability reporting.

## License

No open-source license is granted. The source is publicly visible for repository governance and auditability.
