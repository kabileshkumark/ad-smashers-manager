# Traceability

- Jira issue:
- Branch type: feature / fix / security / docs / test / chore / hotfix / release
- Affected functional requirements (`FR-*`):
- Affected non-functional requirements (`NFR-*`):
- Version impact: none / patch / minor / major
- Target Jira Version:

# Change Summary

- 

# Verification

- Affected Test Case IDs:
- Automated test result:
- Build result:
- Manual/browser/device evidence:

# SDLC And Merge Checklist

- [ ] Branch was created from current `main` and contains one focused Jira scope.
- [ ] Scope is clear and limited.
- [ ] User/data impact is understood.
- [ ] Tests were added or updated where behavior changed.
- [ ] `npm test` passes.
- [ ] `npm run build` passes.
- [ ] Every changed `FR-*` / `NFR-*` has an updated mapped Test Case.
- [ ] Live data backup is not required, or backup has been taken.
- [ ] Firestore rules were not changed, or shared-project impact was reviewed.
- [ ] Security, privacy, PWA, free-tier, and rollback impacts were reviewed where applicable.
- [ ] Feature Catalogue, Test Cases, architecture, runbook, release notes, and Decision Log were updated where applicable.
- [ ] Manual smoke checklist was completed for release-impacting changes.
- [ ] The diff contains no secret, unrelated change, or generated noise.
- [ ] The PR is ready for squash merge and branch deletion.

# Risk Notes

- 

# Release And Rollback Notes

- Deploy required: yes / no
- Backup required: yes / no
- Rollback path:
