# Dispatch for Challenger 2 (Adversarial Figma Ingestion & Streaming Stress Testing)

## Mission
You are Challenger 2. Adversarially stress-test the Web Worker streaming import pipeline, Kiwi decoder, and instance expansion under malformed, corrupt, and massive payloads.
Your working directory is: `/Users/tt/teamwork_projects/voo_design/.agents/teamwork/teamwork_preview_challenger_2`
Project root: `/Users/tt/teamwork_projects/voo_design`

## Mandatory Reading
1. Authoritative user request: `/Users/tt/teamwork_projects/voo_design/.agents/teamwork/ORIGINAL_REQUEST.md` (Read this first!)
2. Project blueprint: `/Users/tt/teamwork_projects/voo_design/PROJECT.md`
3. E2E Test Suite Ready: `/Users/tt/teamwork_projects/voo_design/TEST_READY.md`

## Adversarial Challenge Scope
1. **Streaming Worker Protocol & Admission**:
   - Test corrupted ZIP archives, truncated Kiwi binary chunks, 0-byte inputs, and missing schema chunks.
   - Verify that the worker and client fail gracefully without unhandled exceptions or crashing the host page.
2. **Component Instance Scaling Stress**:
   - Test extreme component instance trees (e.g. 2,000+ nested instances) to verify that instance expansion remains $O(N)$ and does not freeze or overflow recursion limits.
3. **Structured Clone & Transferable Buffers**:
   - Verify that Transferable ArrayBuffers transfer ownership without copying, and that `figSource` does not leak raw Kiwi `nodeChanges` and `blobs`.
4. **Verdict**:
   - Provide empirical verification results and deliver verdict: `APPROVE` or `FAIL`.

Write your report to:
`/Users/tt/teamwork_projects/voo_design/.agents/teamwork/teamwork_preview_challenger_2/handoff.md`
Report back via `send_message` when done.


## 2026-10-21T00:27:58Z
You are Challenger 2 (Streaming Ingestion & Corruption Challenger).
Your working directory is: /Users/tt/teamwork_projects/voo_design/.agents/teamwork/teamwork_preview_challenger_2
Project root: /Users/tt/teamwork_projects/voo_design

MANDATORY FIRST STEP:
Read the authoritative user request at:
/Users/tt/teamwork_projects/voo_design/.agents/teamwork/ORIGINAL_REQUEST.md
Also read your complete dispatch at:
/Users/tt/teamwork_projects/voo_design/.agents/teamwork/teamwork_preview_challenger_2/DISPATCH.md
And read the project blueprint:
/Users/tt/teamwork_projects/voo_design/PROJECT.md

Your task:
Empirically stress-test the Web Worker streaming import pipeline, Kiwi decoder, and instance expansion:
1. Protocol & corruption testing: test corrupted ZIP archives, truncated Kiwi binary chunks, 0-byte inputs, ensuring graceful rejection.
2. Component instance scaling: test deep component trees (2,000+ instances) verifying O(N) scaling.
3. Transferable ArrayBuffers: verify zero-copy buffer transfer and that figSource does not leak raw Kiwi blobs.
4. Run tests and provide empirical verdict (APPROVE / FAIL), write handoff.md, and send message to orchestrator.
