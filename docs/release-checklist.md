# Release Checklist

## Release

- Formal version: Version 1.0
- Technical build: 1.0.10
- Date prepared: 2026-07-24
- Date deployed: 2026-07-24
- Owner: Kabil
- Firebase project: home-kaish
- Hosting site: adsmashers
- Production URL: https://adsmashers.web.app
- Release tag: v1.0.10
- Deployed commit: 2761f736e6c24d5675a4f440efc6904e70ff6bcd
- GitHub pull request: #21
- Jira change task: ADS-18

## Pre-Release

- [x] Approved candidate branch was based on the source later marked as `v1.0.9`.
- [x] Owner approved the localhost QA candidate and production deployment.
- [x] Git status, scoped diff, staged files, and merge tree were reviewed.
- [x] Local QA files and the production export were excluded from Git and Hosting.
- [x] `git diff --check` passed.
- [x] `npm test` passed 149/149 before and after merge.
- [x] `npm run build` synchronized technical build 1.0.10.
- [x] GitHub `test-and-build` passed on PR #21.
- [x] The approved candidate and merged `main` trees both equal `11f774a5208d916382caee3b5d6977a87146a69b`.
- [x] The 24 July production export was retained as the restore point.
- [x] Secret review found no new credential, service-account key, environment file, or backup in the release.
- [x] The existing Firebase web client identifier was unchanged and correctly classified as public client configuration.
- [x] Firebase rules, indexes, functions, and data deployment were excluded.
- [x] Security, privacy, PWA, free-tier, data-compatibility, and rollback impacts were reviewed.

## Candidate Smoke

- [x] The latest production export replayed locally without Firebase writes.
- [x] The 23 July session reproduced the blocked-edit defect.
- [x] Adding a one-court extension recalculated the timeline, court-hours, fee, capacity, rate, stage, and payment coverage.
- [x] Automatically derived Advance and Credit coverage recalculated after the session correction.
- [x] A different session with recorded cash allocations remained protected from financial-basis mutation.
- [x] The existing roster and retained-history deletion protections remained unchanged.
- [x] Refresh restored the source export; no QA mutation reached production.
- [x] Browser storage, service workers, caches, temporary files, and port 4173 were cleared after approval.

## Deploy

Command:

```sh
firebase deploy --only hosting --project home-kaish
```

Deployment completed on 24 July 2026 from merged commit `2761f736e6c24d5675a4f440efc6904e70ff6bcd`. Firebase released 22 Hosting files and no Firestore component.

## Post-Release

- [x] Live application opens and returns the public sign-in shell.
- [x] Live `js/config.js` reports `APP_VERSION = "1.0.10"`.
- [x] Release source is tagged `v1.0.10`.
- [x] Previous deployed source is marked by rollback tag `v1.0.9`.
- [x] GitHub release `Version 1.0 - Technical Build 1.0.10` is published.
- [x] Jira ADS-18 is assigned to Version 1.0, contains release evidence, and is Done.
- [x] App-specific Atlassian defaults now point to Jira project `ADS` and Confluence space `ADS`.
- [x] Confluence Version 1.0, Releases, Feature Catalogue, Test Cases, Payment Lifecycle, and Versioning Strategy pages updated and read back.
- [x] Source-controlled ProjectOS Confluence templates merged through PR #12.
- [ ] Authenticated session correction confirmed in production by the owner.

## Rollback

- Previous version: `v1.0.9`
- Previous source: `ab6fc23db2c801c7306ea6d63078ae7094dc9a7a`
- Restore command: check out `v1.0.9`, run `npm test`, run `npm run build`, then deploy Hosting only
- Restore point: `ad-smashers-backup-2026-07-24.json`
- Restore size: 187362 bytes
- Restore SHA-256: `35dfb617e5abeaadcccde40e8104a222eac11819d4a65a64c5bd0714da192606`
- Compatibility note: build 1.0.10 changes guard behavior only and introduces no Firestore schema migration
- Data recovery: required only if a post-release write is proven incorrect; the Hosting deployment itself made no Firestore write
