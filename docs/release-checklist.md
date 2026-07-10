# Release Checklist

## Release

- Formal version: Version 1.0
- Technical build: 1.0.84
- Date prepared: 2026-07-10
- Owner: Kabil
- Firebase project: home-kaish
- Hosting site: adsmashers
- Jira epic: SCRUM-5
- Jira release task: SCRUM-8

## Pre-Release

- [x] Git status reviewed.
- [ ] Live data exported/backed up.
- [x] Tests pass: `npm test` passed 90/90 tests.
- [x] Build passes: `npm run build` completed.
- [ ] Firebase rules reviewed, if applicable. See SCRUM-9.
- [ ] Security review completed for High/Critical apps.
- [x] Rollback plan drafted.

## Manual Smoke

- [ ] Sign in works.
- [ ] Main workflow works.
- [ ] Data save works.
- [ ] Data reload works.
- [ ] Export/backup works.
- [ ] Mobile view works, if relevant.

## Deploy

Command:

```sh
npm run deploy
```

Do not deploy until live data backup and shared Firebase rules review are complete.

## Post-Release

- [ ] Live app opens.
- [ ] Version/update behavior works.
- [ ] Critical workflow tested against live data.
- [ ] Release notes saved.

## Rollback

- Previous version: last deployed AD Smashers build before v1.0
- Restore command: rebuild and redeploy previous Git commit if smoke test fails
- Backup file: required before deploy
- Manual recovery steps: restore exported state only if release causes data corruption
