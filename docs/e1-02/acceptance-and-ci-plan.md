# E1-02 acceptance and CI plan

## Base

- Temporary worktree: `e1-02-temp-93ab5e2`
- Validation base SHA: `93ab5e270de8557655c6afbb458f4b4687d1927b`
- E1-02 branch remains `feat/e1-02-repo-ci-branch-rules` at `00310c372ef5f0986be0d1198d8652f058543444`
- Pull request 22 is open and is not approved or merged
- No historical RED run is claimed
- No board update or approval is claimed

## Required checks, after the workflow is on the default branch

Require these jobs and one approving review from an account that did not author the change:

- `unit-tests-python`
- `lint-python`
- `unit-tests-frontend`
- `lint-frontend`
- `coverage-frontend`

`coverage-frontend` collects output. It is not a percentage gate. Branch protection must require a pull request, dismiss nothing automatically, include administrators, and disallow force pushes. That configuration is not applied.

During local frontend dependency installation, npm reported 24 vulnerabilities: 20 moderate, 1 high, and 3 critical. These findings require triage; exploitability and remediation have not been assessed. No automatic dependency fixes were applied.

## Backend job

A backend job is not in the workflow. The exact blockers are:

- Playwright browser and Linux library installation
- a DNS-dependent `.invalid` hostname
- no process cleanup for the spawned server or browser
- no coverage provider

Until those are accepted, backend integration tests stay outside required checks. Their absence is a pending gap, not a pass.

## Passing, failing, passing demonstration

Do this only after the workflow and required checks exist. Use a disposable branch. Do not change `main` directly.

1. Push the accepted workflow and record the green jobs.
2. Push a commit that makes one existing test fail. Record that the required check is red and the pull request cannot merge.
3. Remove that failing commit and record the jobs green again.

## WBS status

The numbered source list was not in the repository. These rows follow the requirement groups already used for this story. None are accepted.

| ID | Status | Evidence |
| --- | --- | --- |
| 01 Readiness | pending | Temporary base prepared. Install and execution not approved. |
| 02 Baseline tests | pending | Commands written. Not run. |
| 03 Acceptance checks | pending | This plan only. |
| 04 Fixtures | needs approved adaptation | Existing Python and backend fixtures are sufficient. No new fixture added. |
| 05 RED evidence | pending | No failing run exists. Do not invent one. |
| 06 GREEN evidence | pending | No CI run exists. |
| 07 Repository layout | needs approved adaptation | Three trees stay: Python package, frontend app, root backend. |
| 08 Dependencies | pending | Frontend lockfile is in the temporary base. Python coverage package is proposed only. |
| 09 Lint on push and PR | pending | Jobs are drafted. Not executed. |
| 10 Tests on push and PR | pending | Jobs are drafted. Not executed. |
| 11 Required passing checks | pending | Plan only. Settings not changed. |
| 12 One independent approval | pending | Not configured and not received. |
| 13 Failed check blocks merge | pending | Demonstration not started. |
| 14 Local instructions | pending | `docs/e1-02/local-commands.md` written. Not validated. |
| 15 Full-suite output | pending | Not produced. |
| 16 Coverage output | pending | Local collection ran in the temporary worktree. Not CI. No percentage gate. |
| 17 CI red evidence | pending | No run. |
| 18 CI green evidence | pending | No run. |
| 19 Branch-protection evidence | pending | Settings not changed. |
| 20 Independent review | pending | Not done. |
| 21 Squash merge | pending | Not done. |
| 22 Branch deletion | pending | Not done. |
| 23 Green main | pending | Not shown. |
| 24 Board closure | pending | Not checked and not changed. |
| 25 Independent suites | pending | Five jobs drafted. Backend integration job withheld. |
| 26 Failure demo must not break main | pending | Sequenced after protection, on a disposable branch. |
