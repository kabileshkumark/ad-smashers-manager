# Release Checklist

## Release

- Formal version: Version 1.0
- Technical build: 1.0.8
- Date prepared: 2026-07-19
- Date deployed: 2026-07-19
- Owner: Kabil
- Firebase project: home-kaish
- Hosting site: adsmashers
- Production URL: https://adsmashers.web.app
- Release tag: v1.0.8
- Deployed commit: 134b62153b7d4cafed7c7a12dbabff548e68b937
- GitHub pull request: #18
- Jira change task: ADS-16

## Pre-Release

- [x] Approved candidate branch was based on deployed `v1.0.7`.
- [x] Owner approved the localhost QA candidate and production deployment.
- [x] Git status, scoped diff, and staged files were reviewed.
- [x] Local-only `qa-candidate.html` and `qa-candidate.js` were excluded from Git and Hosting.
- [x] `git diff --check` passed.
- [x] Tests passed: `npm test` passed 145/145.
- [x] Build passed: `npm run build` synchronized technical build 1.0.8.
- [x] GitHub `test-and-build` passed on PR #18.
- [x] Latest production export was retained as the restore point.
- [x] Secret scan found no credential, service-account key, or private backup in the release files.
- [x] Firebase rules and data deployment were excluded.
- [x] Security, privacy, PWA, free-tier, data-compatibility, and rollback impacts were reviewed.
- [x] Rollback to tagged build `v1.0.7` was documented.

## Candidate Smoke

- [x] Latest export replayed locally without Firebase writes.
- [x] Payer-owned Advance and Credit cover eligible group dues without transferring ownership.
- [x] Delete and Reverse produce the intended financial result; only Reverse retains an audit row.
- [x] Activities accept multiple payers whose contributions equal the total.
- [x] Equal, Manual, Percentage, and No. of Shares splits allocate exact cents.
- [x] Activity edits and deletion reconcile Due, Credit, receipts, and history.
- [x] Split-mode icons remain in one row at desktop, 390 px, and 320 px widths.
- [x] Local QA reported no console errors, horizontal overflow, or overlapping controls.
- [x] Temporary browser contexts were closed and no QA data was persisted.

## Deploy

Command:

```sh
firebase deploy --only hosting --project home-kaish
```

Deployment completed on 2026-07-19 from merged commit `134b62153b7d4cafed7c7a12dbabff548e68b937`. Firebase released 22 Hosting files and no Firestore component.

## Post-Release

- [x] Live app opens and returns HTTP 200.
- [x] Live `js/config.js` reports technical build `1.0.8`.
- [x] Public sign-in shell renders at 390 x 844 with no horizontal overflow.
- [x] Service worker controls the production page.
- [x] Production smoke produced no console or page errors.
- [x] Release source is tagged `v1.0.8`.
- [x] GitHub release `Version 1.0 - Technical Build 1.0.8` is published.
- [x] Jira ADS-16 is assigned to Version 1.0, contains release evidence, and is Done.
- [x] Confluence release, feature, test, payment, architecture, and versioning pages were updated and read back.
- [x] ProjectOS documentation source was merged through PR #11.
- [ ] Authenticated protected workflows confirmed in production by the owner.
- [ ] Production payment and activity layouts confirmed on the owner device.

## Rollback

- Previous version: `v1.0.7`
- Restore command: check out `v1.0.7`, run `npm test`, run `npm run build`, then deploy Hosting only
- Restore point: `ad-smashers-backup-2026-07-19.json`
- Restore SHA-256: `a55df6d03c358c56378bda91a4130ac69e49c922997294cae19e71905ce4417d`
- Compatibility note: build 1.0.7 does not understand multi-payer or non-equal activity fields; do not edit those activities while rolled back
- Data recovery: required only if a post-release write is proven incorrect; the Hosting deployment itself made no Firestore write
