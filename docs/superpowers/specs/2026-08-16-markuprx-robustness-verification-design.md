# MarkuprX Robustness Verification Design

**Status:** Approved under the user's standing instruction to proceed autonomously and use best judgment.

## Context

The merged MarkuprX implementation passed 1,522 Vitest checks, package verification, and an installed arm64 launch smoke test. A subsequent Electron UI run exposed an intermittent failure in the coalesced Command-release/navigation-click scenario. Ten isolated repetitions failed seven times.

Temporary boundary diagnostics proved that the application dispatched the snapshot request, captured and staged the PNG, promoted it to `screenshots/marked-issue-001.png`, and only then failed the assertion. The test was reading `feedback-report.md` as soon as the session directory appeared, while report finalization was still running. Its failure cleanup then closed Electron before the final report rewrite. The application already exposes `Report Ready` only after report finalization; the test must use that completion contract.

## Goals

- Make Electron functional tests observe user-visible completion rather than intermediate filesystem state.
- Exercise high-risk annotation/report paths that are not yet covered end to end.
- Verify back-to-back sessions do not leak marked issues, screenshots, comments, or state.
- Add a reusable smoke check for the actual packaged application.
- Stress-repeat timing-sensitive paths and rerun the entire unit, integration, end-to-end, UI, build, package, brand, and security verification set.
- Reinstall the final Apple-silicon package and leave it running for manual testing.

## Non-Goals

- No new user-facing feature or workflow is introduced.
- No production behavior is changed unless a new failing functional test demonstrates a genuine product defect.
- The suite will not depend on Apple signing or notarization credentials; local unsigned-package launch remains the supported verification path.

## Recommended Layered Approach

The suite will combine four levels instead of relying on one test type:

1. **Deterministic Vitest checks** cover reducers, ordering, persistence, report generation, integrations, CLI, MCP, failure handling, and security boundaries quickly.
2. **Electron UI tests** exercise real IPC, windows, recording composition, annotation controls, accessibility, persistence, and report output using the deterministic media harness.
3. **Stress repetitions** run race-prone scenarios repeatedly with one worker so a pass cannot hide probabilistic ordering failures.
4. **Packaged-app smoke verification** launches the built executable with an isolated profile and asserts architecture-independent runtime identity, packaged status, version, window title, and onboarding visibility.

UI-only coverage would be realistic but slow and more timing-sensitive. Unit-only coverage would miss Electron process boundaries. The layered approach provides both precise failures and real-workflow confidence.

## Functional Scenarios

### Finalization Contract

The coalesced Command-release/click test will wait for the `Report Ready` heading before reading the report. It will still assert the narrated comment, Markdown image link, and PNG size, so removing snapshot promotion or final report insertion will fail the test.

### Stop With Pending Marks

A new Electron scenario will draw and release Command, narrate a comment, and press Stop without the ordinary click that normally commits the issue. It will verify that stop finalization creates exactly one marked issue with its comment and PNG evidence. This protects the final-mark preservation contract.

### Back-to-Back Session Isolation

A new Electron scenario will complete two recording sessions in one application process with distinct comments. It will verify two output directories, unique session IDs, one marked screenshot per report, and no cross-session comment leakage. This protects accumulator, recorder, artifact-store, and renderer reset behavior.

### Packaged Runtime

A reusable script will launch the package selected for the host platform/architecture or an explicit executable path. It will use a temporary profile, assert `app.isPackaged`, `MarkuprX`, version `3.0.0`, the expected window title, and fresh-profile onboarding, then close and clean up.

## Test Reliability Rules

- Wait on app-owned semantic state (`Report Ready`, diagnostics, processing trace) rather than arbitrary sleeps or directory creation alone.
- Keep exact report, metadata, image, and session-isolation assertions after readiness is established.
- Use isolated user-data, documents, and output directories per Electron test.
- Run Electron tests with one worker; repeat only high-risk tests during stress checks.
- Attach renderer/main logs, reports, screenshots, and traces on failure.
- Remove all temporary diagnostic logging before final verification.

## Success Criteria

- The stabilized coalesced-event scenario passes at least 20 consecutive repetitions.
- The full Electron UI suite passes twice consecutively, including the pending-stop and back-to-back-session scenarios.
- All Vitest files pass with no failed or skipped tests.
- Type checking, brand verification, package-native-runtime verification, and builds pass.
- Lint has zero errors; existing warnings are reported explicitly.
- Production dependency audit reports zero vulnerabilities.
- The packaged-app smoke test passes against the final arm64 bundle.
- The final bundle is reinstalled at `/Applications/MarkuprX.app`, launches successfully, and is left running for the user.

