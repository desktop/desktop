# Copilot evaluations

The private sibling `desktop/copilot-evals` repository owns benchmark fixtures,
model presets, grading, workflows, and reports. Desktop owns the feature code.
The evaluation bridge runs the checked-out Desktop implementation rather than
maintaining a separate copy of its prompts or validation.

## Headless bridge

After installing Desktop's locked dependencies with `npm ci`, run:

```sh
node script/copilot-eval.mjs --describe
node script/copilot-eval.mjs --list-models
node script/copilot-eval.mjs < request.json > result.json
```

`npm run copilot:eval -- <arguments>` is also available. Direct invocation
produces only JSON on stdout; diagnostics go to stderr. Each process accepts
one JSON request, bounded to 32 MiB. An evaluation error returns a structured
envelope and nonzero exit status. Startup/dependency failures can prevent an
envelope from being produced and must be treated as infrastructure failures.

The versioned contracts are in `script/copilot-eval/protocol.ts`. Unknown
versions, fields, features, input kinds, and escaping fixture paths are rejected.
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

The application and bridge share `runAssistedCommitPlanningRequest`: prompt
construction, sanitation, model request, deadline, parsing, and cleanup.
Repository fixtures additionally use real snapshot capture,
`planAssistedCommits`, and cumulative-tree validation. Only canonical
unsafe-split validation permits a fresh single-commit fallback. Turns, including
failed raw responses and fallback requests, remain available in the result.
Successful repository results expose the final canonical plan.

The shared planner submits `CopilotAssistedCommitResponseSchema` on every turn,
including the whole-selection fallback. The model-facing response is
`{"result": <outcome>}`; the bridge's top-level `response` remains the normalized
application outcome, without that wire envelope. Scripted `plan` and uncertainty
responses construct the current model envelope; `raw` responses are
sent verbatim and must explicitly include it when testing semantic rejection.
The planner schema has no refusal outcome: a plan contains one or more commits,
or uncertainty supplies one message for the complete selection.

Each recorded turn includes the exact SDK `responseSchema` and the final
request-correlated root response, including malformed JSON rejected by parsing.
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
`GITHUB_TOKEN`, in that order. The bridge never reads Desktop secure storage or
discovers a logged-in CLI account. The selected model is sent unchanged, with
the production built-in reasoning default left unset.

The runtime uses a fresh Copilot home and in-memory session storage.
`instructions.global` and `instructions.repository` supply the intended
instruction fixtures; ambient user instructions and MCP configuration are not
loaded. The appended system prompt in a report is not a trace of SDK-internal
instruction expansion or model reasoning.

Do not run untrusted Desktop branches with inference credentials. The selected
branch executes code, regardless of the planner's model-tool restrictions.
Only approved synthetic or appropriately licensed fixtures should be sent to a
provider. The private evaluator performs model preflight and budgets; the bridge
itself does not silently substitute models or retry bad answers.

## Private workflow execution

Evaluation workflows run only in the private `desktop/copilot-evals` repository.
This public repository has no evaluation or dispatch workflow. It owns only the
production feature and headless bridge; benchmark data and run results are not
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
