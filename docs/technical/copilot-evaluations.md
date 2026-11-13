# Copilot evaluations

The private sibling `desktop/copilot-evals` repository owns benchmark fixtures,
model presets, grading, workflows, reports, and the headless CLI. Desktop owns
the feature code and its typed evaluation adapter. The private CLI loads the
checked-out Desktop adapter rather than maintaining a separate copy of its
prompts or Git validation.

## Evaluation adapter

Install Desktop's locked dependencies with `npm ci`. Then run the evaluator from
the private sibling repository, passing the Desktop checkout explicitly:

```sh
cd ../copilot-evals
npm run evaluate -- --desktop-path ../desktop --preflight
npm run evaluate -- --desktop-path ../desktop --list-models
```

Desktop provides `runCopilotEvaluation` and `listCopilotEvaluationModels` in
`app/src/lib/copilot-evaluation.ts`. Its versioned input/output types and
`CopilotEvaluationCapabilities` are in
`app/src/lib/copilot-evaluation-protocol.ts`. These modules do not import the
private repository. The CLI owns JSON parsing, process startup, cancellation
forwarding, and the Node bootstrap for Desktop's build-time constants; it uses
the selected checkout's metadata and installed dependencies.

The private CLI rejects unknown versions, fields, features, and input kinds
before invoking the adapter. The adapter independently rejects escaping fixture
paths and Git metadata paths before writing files. Typed callers must supply
validated plain request data. Model preflight and active planning accept an
abort signal; preflight also retains its independent 60-second deadline.
The initial feature is `assisted-commit`; inputs are either selected-only analysis
or a disposable repository fixture. File contents are UTF-8 strings, including
NUL-containing binary fixtures. Changed-file values of `null` delete files.
Deletions are applied before writes, independently of JSON property order, so
replacing a tracked file with child paths does not require a special ordering.
Every `baseFiles` entry is tracked in the seed commit, even if fixture
`.gitignore` rules match it.
Repository selection lists paths and optional zero-based text hunk indices.
Rename setup and arbitrary binary encodings are not part of this initial fixture
format; analysis fixtures can describe atomic renames.

For example:

```json
{
  "protocolVersion": 1,
  "feature": "assisted-commit",
  "model": "offline-fixture",
  "input": {
    "kind": "repository",
    "baseFiles": { "file.txt": "old\n" },
    "files": { "file.txt": "new\n" },
    "selection": [{ "path": "file.txt" }]
  },
  "transport": {
    "kind": "fixture",
    "responses": [
      { "type": "plan", "groups": [{ "title": "Update the selected file" }] }
    ]
  }
}
```

`fixture` transport supplies explicitly scripted offline model responses.
`copilot` transport uses the real SDK/runtime installed by the selected Desktop
lockfile. Offline runs establish contract behavior, not real-model quality.

The application and adapter share `runAssistedCommitPlanningRequest`: prompt
construction, sanitation, model request, deadline, parsing, and cleanup.
Repository fixtures additionally use real snapshot capture,
`planAssistedCommits`, and cumulative-tree validation. Only canonical
unsafe-split validation permits a fresh single-commit fallback. Turns, including
failed raw responses and fallback requests, remain available in the result.
Successful repository results expose the final canonical plan.

The shared planner submits `CopilotAssistedCommitResponseSchema` on every turn,
including the whole-selection fallback. The model-facing response is
`{"result": <outcome>}`; the adapter's top-level `response` remains the normalized
application outcome, without that wire envelope. Scripted `plan` and uncertainty
responses construct the current model envelope; `raw` responses are
sent verbatim and must explicitly include it when testing semantic rejection.
The planner schema has no refusal outcome: a plan contains one or more commits,
or uncertainty supplies one message for the complete selection.

Each recorded turn includes the exact SDK `responseSchema` and the final
request-correlated root response, including malformed JSON rejected by parsing.
Turn durations are finalized during cleanup even after cancellation or timeout.
Intermediate messages, unrelated/child responses, and superseded corrections
are not reported as the model's final answer. Completion, cancellation, and
error handling use the foundation's production event waiter rather than a
second evaluator-specific completion implementation.

Planning does not create user commits or push. Seed commits are created only
inside owned temporary fixture repositories. HEAD, index, and worktree contents
are compared before and after planning, including failed plans. Fixture
directories and isolated SDK configuration are removed before returning.

The local Git host supplies a clean Git configuration, including snapshot
configuration capture and XDG ignore sources, without application
credential/trampoline services. It does not replace Git execution, ownership
fences, or snapshot/tree validation. Requests for application credentials or
intercepted hooks through this host fail explicitly. Normal application Git
operations retain the existing hook/trampoline environment.

## Live credentials and trust

Live invocations require an explicit `COPILOT_GITHUB_TOKEN`, `GH_TOKEN`, or
`GITHUB_TOKEN`, in that order. The adapter never reads Desktop secure storage or
discovers a logged-in CLI account. The selected model is sent unchanged, with
the production built-in reasoning default left unset.

Live evaluation sessions use `github/desktop-evals:assisted-commit` feature
attribution; application sessions retain `github/desktop:assisted-commit`.
Both use the `copilot-desktop` integration ID, so integration-wide usage metrics
must filter by feature attribution to separate evaluations from user activity.

The runtime uses a fresh Copilot home and in-memory session storage.
`instructions.global` and `instructions.repository` supply the intended
instruction fixtures; ambient user instructions and MCP configuration are not
loaded. The appended system prompt in a report is not a trace of SDK-internal
instruction expansion or model reasoning.

Do not run untrusted Desktop branches with inference credentials. The selected
branch executes code, regardless of the planner's model-tool restrictions.
Only approved synthetic or appropriately licensed fixtures should be sent to a
provider. The private evaluator performs model preflight and budgets; the adapter
itself does not silently substitute models or retry bad answers.

## Private workflow execution

Evaluation workflows run only in the private `desktop/copilot-evals` repository.
This public repository has no evaluation or dispatch workflow. It owns only the
production feature and typed adapter; benchmark data and run results are not
stored in its Actions logs, summaries, artifacts, or PR comments.

Automatic development evaluations use a GitHub App webhook relay owned by the
private evaluator. The relay verifies signed `desktop/desktop` push events for
`refs/heads/development` and sends a `desktop-development-push` repository
dispatch to `desktop/copilot-evals`, carrying only the exact pushed SHA and
delivery provenance. The private workflow accepts that automatic path only from
the configured relay App and refuses to run in a public repository.

GitHub Actions has no native cross-repository push subscription. The relay must
be deployed behind HTTPS and configured with its webhook secret, narrowly scoped
App installation, and persistent delivery state before automatic runs work.
Deployment and credentials are separate owner setup, not provisioned by this
repository. Manual evaluations remain available in the private repository.
See its README for relay setup, environments, duplicate-delivery handling, and
failure recovery. Reports and detailed diagnostics remain private.
