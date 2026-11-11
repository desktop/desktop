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

Planning does not create user commits or push. Seed commits are created only
inside owned temporary fixture repositories. HEAD, index, and worktree contents
are compared before and after planning, including failed plans. Fixture
directories and isolated SDK configuration are removed before returning.

The local Git host supplies a clean Git configuration without application
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

## Development push dispatch

`.github/workflows/copilot-evals.yml` is a separate, checkout-free bridge from
each `development` push to the private evaluator. It passes the exact event SHA,
source run ID, and source URL. It has no path filter or concurrency group that
would replace pending pushes.

The bridge is disabled until publication/configuration. To enable it:

1. Publish the private evaluator with `evaluate.yml` on its default branch.
2. Install a GitHub App on `desktop/copilot-evals` with Actions write permission.
3. Configure `COPILOT_EVALS_APP_ID` as a Desktop repository variable and
   `COPILOT_EVALS_APP_PRIVATE_KEY` as a Desktop Actions secret.
4. Configure the evaluator's protected manual environment and trusted automatic
   environment, plus inference permission or an approved credential. Verify one
   manual live run before enabling unattended development evaluations.
5. Set the Desktop variable `COPILOT_EVALS_ENABLED` to `true`.

The App token authorizes dispatch only; it is not an inference credential and is
never handed to evaluated Desktop code. Dispatch failure fails the bridge job.
When the API provides a run URL, it appears in the source run's summary.
Private report access still requires access to the private repository.

Pushes authenticated with a repository `GITHUB_TOKEN` do not ordinarily trigger
new push workflows. Automated development writers must use an appropriate App
credential or dispatch evaluations explicitly.
