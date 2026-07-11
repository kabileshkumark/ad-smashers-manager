# Release Checklist

## Release

- Formal version: Version 1.0
- Technical build: 1.0
- Date prepared: 2026-07-10
- Date deployed: 2026-07-11
- Owner: Kabil
- Firebase project: home-kaish
- Hosting site: adsmashers
- Production URL: https://adsmashers.web.app
- Release tag: v1.0.0
- Deployed commit: 2b8972adab219f34ac7534e4a5fc3dff6c677155
- Jira release task: ADS-2

## Pre-Release

- [x] Git status reviewed.
- [x] Live data exported/backed up; owner confirmed completion.
- [x] Tests pass: `npm test` passed 91/91 tests.
- [x] Build passes: `npm run build` completed.
- [x] Firebase rules deployment excluded; this was a Hosting-only release.
- [ ] Security review completed for High/Critical apps.
- [x] Rollback plan drafted.

## Manual Smoke

- [ ] Sign in works.
- [ ] Main workflow works.
- [ ] Data save works.
- [ ] Data reload works.
- [x] Export/backup completed by the owner.
- [ ] Mobile view works, if relevant.

## Deploy

Command:

```sh
npm run deploy
```

Deployment completed on 2026-07-11 with `firebase deploy --only hosting --project home-kaish`.

## Post-Release

- [x] Live app opens and returns HTTP 200.
- [x] Version/update assets report technical build `1.0`.
- [ ] Critical workflow tested against live data.
- [x] Release notes saved in GitHub and the repository.

## Rollback

- Previous version: last deployed AD Smashers build before v1.0
- Restore command: rebuild and redeploy previous Git commit if smoke test fails
- Backup file: owner-held pre-deploy export confirmed on 2026-07-11
- Manual recovery steps: restore exported state only if release causes data corruption
