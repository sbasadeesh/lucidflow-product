# LucidFlow

Evidence-led dark-pattern assessment for clearer, more trustworthy digital journeys.

LucidFlow is being developed to help insurance and financial-services teams identify potential deceptive design patterns in selected web pages and approved customer journeys. The product direction combines page capture, structured findings, supporting evidence, human review, assessment reporting, and corrective-action planning.

> Status: Early development. This repository is the foundation for the LucidFlow product. The capabilities below describe intended scope, not a claim that they are implemented or available.

## Product vision

Help product, engineering, compliance, and risk teams understand potential customer-experience risks, review the evidence, and prioritise improvements.

LucidFlow is decision support. Automated findings are potential issues requiring appropriate human review, not legal conclusions or a guarantee of compliance.

## Product roadmap

| Phase | Focus | Intended outcome |
| --- | --- | --- |
| Visibility | Assessment, evidence capture, findings review, and reporting | Understand potential issues in the assessed scope |
| Remediation | Ownership, corrective actions, closure evidence, and verification | Track and verify improvements |
| Prevention | Pre-release checks and integration into delivery workflows | Reduce recurrence of known issues |

The initial priority is P0 within the Visibility phase. Later phases are roadmap items, not current commitments.

## Initial P0 scope

The proposed initial workflow is:

1. Enter an approved page URL or supply an approved, ordered journey.
2. Render the page and capture defined states.
3. Run supported deterministic detection rules.
4. Save screenshots, DOM evidence, timestamps, and state references.
5. Produce structured potential findings and code-calculated KPIs.
6. Review findings and confirm or reject them.
7. Produce an assessment report and corrective-action plan (CAP) within the agreed scope.

Potential detection areas include pre-selected optional add-ons, hidden or low-contrast controls, repeated overlays, false-urgency timers, forced actions, and price changes across states. Actual coverage depends on implemented, tested, and approved rules.

### Scope boundaries

Original P0 scope does not include authenticated areas, full-domain discovery, mobile applications, or bots. Do not bypass login, OTP, CAPTCHA, or payment controls, and do not make payments during assessment.

Any domain-discovery preview or simulated scan must be clearly labelled as demo/sample data. Discovering a URL does not prove that it was scanned, and discovery does not guarantee complete website coverage.

Scope changes require an explicit product decision and updated acceptance criteria.

## Core product principles

- Evidence first: Findings must be traceable to the assessed page and state.
- Human review: Customer-facing reports include confirmed findings only.
- Honest outcomes: A page that cannot be assessed must not be reported as clean.
- Code-derived facts: Counts and KPIs come from application logic, not AI-generated wording.
- Repeatable testing: Automated tests use controlled fixtures and mocks.
- Privacy by design: Do not commit customer data, credentials, tokens, or confidential content.
- Clear limitations: Reports state what was assessed and what was not assessed.

## Planned shared payload contract

The P0 design proposes a shared JSON payload with these top-level fields:

| Field | Purpose |
| --- | --- |
| `scan` | Scan identity, scope, timing, and execution metadata |
| `detection` | Assessment outcome and relevant assessment limitations |
| `findings` | Structured potential findings and review status |
| `evidence` | Screenshot, DOM, URL, timestamp, and state references |
| `kpis` | Code-calculated totals and distributions |
| `ai_payload` | Minimised confirmed-finding facts for approved AI hand-off |

The canonical schema, examples, and validators will be added and reviewed in the repository. Do not treat this table as a substitute for an approved schema.

JSON Schema checks structure; application validators must also check semantic relationships such as evidence references, KPI arithmetic, and confirmed-only report/AI membership.

### Assessment outcomes

- `yes`: Qualifying potential findings exist.
- `no`: Assessment completed successfully with no qualifying findings in the assessed scope.
- `could_not_assess`: The page or required scope could not be assessed.

Exact enum values must follow the approved schema. A `no` result is not a compliance certificate or proof that every possible issue is absent.

### Finding lifecycle

`candidate` -> `confirmed` or `rejected`

Review actions should record reviewer identity and time. Rejected findings must not inflate report KPIs. Each displayed KPI must clearly identify its finding population.

## Architecture and technology

The implementation stack has not been established in this empty repository.

The original P0 plan proposes Python, Playwright, pytest, pytest-cov, and Streamlit. Earlier prototype documentation describes a React/Node.js application with browser capture and local AI. These are distinct implementation directions: confirm and document the approved architecture before adding code or dependencies.

Do not assume prototype functionality is implemented in this repository.

## Suggested repository structure

The following is a proposal, not a list of existing files:

```text
.
├── README.md
├── docs/                 # Architecture, scope, testing, and review evidence
├── src/                  # Product implementation; adapt to the approved stack
├── tests/                # Unit, component, integration, and acceptance tests
├── fixtures/             # Controlled HTML, payloads, and expected outcomes
├── config/               # Approved configuration and thresholds
└── .github/              # PR templates and CI workflows
```

If the approved architecture uses separate frontend and backend folders, document that structure rather than creating a parallel unused `src/` implementation.

## Getting started

This repository does not yet contain a runnable application, dependency manifest, or verified startup commands.

Initial setup work:

1. Confirm the P0 scope and active technology stack.
2. Add and agree the shared schema, example payloads, and semantic validators.
3. Establish fixture naming and expected-result conventions.
4. Add dependency manifests, environment documentation, and a safe example configuration.
5. Configure automated tests, lint checks, and CI.
6. Document verified installation, test, and startup commands here.

Do not add guessed commands or claim setup is complete before verifying it.

## Development workflow

1. Select a dependency-ready story with clear acceptance criteria.
2. Create a short-lived task branch from the agreed integration branch.
3. Write failing tests before new deterministic logic.
4. Implement the smallest correct change and refactor with tests green.
5. Run relevant tests and the full applicable suite; save real results.
6. Push the task branch and open a pull request using the team template.
7. Complete independent review and required CI checks.
8. Merge through the agreed branch/release process.

Keep PRs focused. Do not weaken tests, fabricate approvals, or include unrelated changes. Approval, merge, and product acceptance are separate milestones.

## Testing and quality

The testing framework should cover:

- Unit tests for rule and utility behaviour.
- Component tests for capture, payloads, KPIs, rendering, and UI logic.
- Integration tests for end-to-end workflows on controlled fixtures.
- Evidence completeness and reference-integrity checks.
- Per-rule precision and recall on reviewed labelled data.
- AI-output grounding and wording checks where AI is used.
- Manual acceptance and visual review where appropriate.

Read `docs/TEST_FRAMEWORK.md` once it is added. Preserve fixtures, expected outcomes, regression tests, and historical evidence. Never report an unexecuted check as passed.

The P0 test strategy proposes approximately 100–120 automated tests and at least 80% line coverage for rule-library code. These are initial planning targets to agree with the team, not proof of quality or universal standards. Precision/recall thresholds must also be agreed and measured before accuracy claims are made.

### P0 checkpoints

| Gate | Purpose |
| --- | --- |
| G0 | Agree schema and mock payload across teams |
| G1 | Verify initial detection behaviour on labelled examples |
| G2 | Verify KPI accuracy |
| G3 | Verify evidence completeness |
| G4 | Render reports from payloads without manual fact edits |
| G5 | Meet agreed accuracy, repeatability, coverage, and defect criteria |
| G6 | Complete the approved customer demonstration with reviewed findings |

Passing P0 does not by itself establish production SaaS readiness. Security, performance, UAT, deployment, and operational requirements need explicit planning and verification.

## AI usage

For original P0, AI is a controlled payload-only wording hand-off, not the source of detection facts or KPI arithmetic.

- Use minimised, approved, confirmed-finding facts.
- Validate output structure and grounding.
- Reject invented URLs, counts, patterns, and legal conclusions.
- Keep providers and model identifiers configurable through one interface.
- Verify current model availability and capabilities before integration.
- Do not send confidential or personal data to external providers without explicit authorisation and appropriate controls.
- Clearly label mock AI output.

No provider, hosted model, or local model is established by this README.

## Security and responsible use

- Assess only URLs and scope for which the team has appropriate authorisation; customer assessments require written permission.
- Use test data and controlled fixtures for development and automated testing.
- Never commit secrets, environment credentials, customer records, or confidential assessment evidence.
- Keep sensitive assessment artifacts in approved storage with appropriate access controls.
- Respect access restrictions and stop at authentication, OTP, CAPTCHA, or payment barriers.
- Report suspected security issues privately to the repository owner; do not publish sensitive details in a public issue.

## Contributing

Team contributions should include:

- Story ID and acceptance criteria.
- A focused implementation and meaningful tests.
- Fixtures and expected outcomes where relevant.
- Actual test results and evidence tied to the reviewed commit.
- Documentation updates and known limitations.
- Required approval for shared-schema or scope changes.

The repository owner will document contribution access, branch protection, review ownership, and release permissions as the repository is configured.

## Licensing

No license is established by this README. The repository owner must add an approved `LICENSE` file and clarify permitted use before external distribution.
