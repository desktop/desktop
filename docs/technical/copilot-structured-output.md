# Copilot structured output

Assisted commit planning, ordinary commit-message generation and conflict
resolution submit a feature-specific `responseSchema` on **every** SDK message.
It is a per-run request option, not a session default. The assisted whole-selection
fallback, every parallel conflict chunk and its existing validation retry all
retain their schema. Desktop does not change models or retry without a schema
when a route rejects structured output.

## Model-facing contracts

Schemas live beside each feature's response contract:

| Feature | Schema | Model output |
| --- | --- | --- |
| Assisted commits | `CopilotAssistedCommitResponseSchema` | `{"result": <plan, uncertain-boundaries, or unsafe>}` |
| Commit messages | `CopilotCommitMessageResponseSchema` | `{"title": "...", "description": "..."}` |
| Conflicts | `CopilotConflictResolutionResponseSchema` | `{"resolutions": [...], "summary": "... or null", "references": [...]}` |

The schema vocabulary deliberately targets the intersection of OpenAI strict
structured outputs and Anthropic native JSON output: an object root, nested
`anyOf`, typed properties and array items, enums, every property required, and
`additionalProperties: false` on every object. No root union, `oneOf`, conditional
schema, references, string constraints or array-count constraints are needed.
Provider budgets and model capabilities can impose further limits.

OpenAI strict mode cannot directly express the old assisted root union or
omitted optional fields. The model-facing assisted envelope puts the outcome
union under `result`; descriptions are strings, with `""` representing no body.
`parseCopilotAssistedCommitStructuredResponse` accepts only this explicit bare
JSON envelope, checks its size and fields, then delegates to the existing
`validateCopilotAssistedCommitResponse`. The backend-independent bare-outcome
parser and application types remain available unchanged. No arbitrary JSON
extraction, Markdown removal or output repair is added.

Ordinary generation also requests an empty string for no body. Its parser
accepts only bare JSON, preserving code fences inside string values rather than
extracting fenced fragments. Markdown-wrapped responses are rejected, without a
legacy fallback. The parser still normalizes an omitted description to `""` and
rejects invalid description types.

Conflicts request `action: null` for text conflicts and `"keep"` or `"delete"`
for delete/modify conflicts. The action schema uses `anyOf` with a string-enum
branch and a separate null branch. A reported `claude-haiku-4.5` route rejects
an enum alongside `type: ["string", "null"]`, despite that being valid JSON
Schema. The shared schema type and regression tests keep enums scalar-typed;
successful hosted Haiku inference after this representation change remains
unverified. The existing parser already treats null/missing
action as absence. Ordered hunk contents, paths and reasoning retain their
meaning. Models are asked for a string or null summary and an array of references,
but missing/malformed summary and references remain nonfatal in the application
parser. Schema requests do not introduce new application-level metadata gates.

Schemas constrain generation, not authority. Existing validators still enforce
snapshot identity, title rules, exact-once change ownership, canonical cumulative
Git trees, expected conflict paths, hunk counts, conflict-marker rejection and
reassembly. The assisted fallback still requires one commit. No schema output
authorizes Git operations or changes snapshot checks.

## Completion and lifecycle

The event-driven waiter subscribes before `send`, buffers events until its
acknowledgement supplies the originating message ID, and selects only matching
root-agent `assistant.message` events. `turnId` is not a run identifier. The last
matching message supersedes earlier candidates; a later tool request invalidates
an earlier candidate.

Completion requires consumption of the request followed by non-Autopilot
`session.idle`, or matching `session.autopilot_stopped`. Child/unrelated messages
and idle events before request consumption cannot supply a result. Aborted idle,
matching failed/aborted Autopilot completion, session errors and failed admission
cannot turn an intermediate response into success. Session-wide errors remain
terminal; correlated errors from other requests are ignored.

Assisted planning retains its encompassing deadline, cancellation, late-resource
disposal and bounded runtime teardown. Conflict resolution uses the same
event-driven completion helper while retaining reasoning snippets, turn timeout
and cancellation. All listeners/timers are released before session teardown.
Ordinary generation continues to use SDK `sendAndWait`, whose shipped
implementation waits for request-owned completion and rejects aborted runs.
Existing billing/error policies remain feature-specific.

Custom-instruction loading, append-mode system prompts, authentication/refresh,
BYOK configuration, selected models, reasoning defaults and tool/permission
policies are unchanged. Existing retry policies are unchanged: one canonical
unsafe-split fallback for assisted commits, one validation retry for conflicts,
and no generic JSON retry.

## Verification and limitations

`copilot-assisted-commit-sdk-test.ts` exercises SDK `1.0.27-preview.1` and its
bundled runtime `1.0.104-1` using model ID `synthetic-model`, a loopback-only BYOK
base URL `http://127.0.0.1:1`, and SDK `CopilotRequestHandler` interception.
Only synthetic prompts, changes and instructions are used; no model provider is
contacted. All three production paths exercise OpenAI Chat Completions
(`response_format.json_schema`), OpenAI Responses (`text.format`) and native
Anthropic Messages (`output_config.format`), including streaming conflicts.
The fixture checks the actual native request and validates its synthetic payload
against the schema. A real runtime stop-hook correction verifies schema/origin
retention, final-response selection and failure after an intermediate response.

These are real SDK/runtime integration tests, **not** evidence of native
constrained decoding by a hosted model. Real OpenAI, Anthropic, GitHub-hosted and
other BYOK model/endpoint combinations remain unverified. An API-compatible
gateway may accept and ignore a schema; Claude's Chat Completions compatibility
route is not equivalent to native Anthropic JSON output. Universal enforcement
across models/providers cannot be guaranteed by an application schema.

The installed SDK documents explicit rejection of remote sessions and known
HydraFusion routes. Provider errors, unsupported schema vocabulary, refusals,
truncation and runtime/model limitations remain visible failures, not permission
to silently downgrade.

See the installed SDK README's **Structured output (preview)** section,
[OpenAI supported schemas](https://developers.openai.com/api/docs/guides/structured-outputs#supported-schemas)
and [Anthropic schema limitations](https://platform.claude.com/docs/en/build-with-claude/structured-outputs#json-schema-limitations).
