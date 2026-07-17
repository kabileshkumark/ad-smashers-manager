# Release Checklist

## Release

- Formal version: Version 1.0
- Technical build: 1.0.5
- Date prepared: 2026-07-17
- Date deployed: 2026-07-17
- Owner: Kabil
- Firebase project: home-kaish
- Hosting site: adsmashers
- Production URL: https://adsmashers.web.app
- Release tag: v1.0.5
- Deployed commit: e0f0218b97fe
- GitHub pull request: #11
- Jira release task: ADS-2
- Jira change task: ADS-11

## Pre-Release

- [x] Approved candidate branch was based on deployed `v1.0.4`.
- [x] Owner approved the localhost-only synthetic QA candidate.
- [x] Git status and scoped diff were reviewed.
- [x] `git diff --check` passed.
- [x] Tests passed: `npm test` passed 109/109.
- [x] Build passed: `npm run build` synchronized technical build 1.0.5.
- [x] GitHub `test-and-build` passed on PR #11.
- [x] Feature Catalogue and Test Cases were updated for every affected FR/NFR.
- [x] Live backup was classified not required because this patch changes Hosting presentation/navigation only.
- [x] Firebase rules and data deployment were excluded.
- [x] Security, privacy, PWA, free-tier, and rollback impacts were reviewed.
- [x] Rollback to tagged build `v1.0.4` was documented.

## Candidate Smoke

- [x] Payment Group amount starts blank.
- [x] Payment Group amount plus five actions remain in one responsive top-right row.
- [x] Player Balance actions remain top-right with responsive square sizing.
- [x] Advance History balance/delete controls remain top-right and deductions use full width.
- [x] Brand navigation paints `Opening Dashboard...` before Dashboard rendering.
- [x] Local QA server, port, fixtures, and temporary files were removed after approval.

## Deploy

Command:

```sh
npm run deploy
```

Deployment completed on 2026-07-17 with `firebase deploy --only hosting --project home-kaish` from merged commit `e0f0218b97fe`.

## Post-Release

- [x] Live app opens and returns HTTP 200.
- [x] HTML, config, manifest, service-worker cache, and versioned assets report technical build `1.0.5`.
- [x] Live `events.js` contains the approved Dashboard-loading path.
- [x] Live stylesheet contains the approved Payment Group, Player Balance, and Advance History selectors.
- [x] `sw.js` is served with `Cache-Control: no-cache`.
- [x] Release source is tagged `v1.0.5`.
- [ ] Authenticated protected workflow tested in production by the owner.
- [ ] Production payment and Dashboard layouts confirmed on the owner device.

## Rollback

- Previous version: `v1.0.4`
- Restore command: check out `v1.0.4`, run `npm test`, run `npm run build`, then deploy Hosting only
- Backup requirement: none for this UI-only patch
- Data recovery: not applicable; build 1.0.5 changed no Firebase data or Firestore rules
