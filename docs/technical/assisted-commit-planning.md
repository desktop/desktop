# Assisted commit planning

This is the third backend layer of plan-first assisted commits. The sidebar's
execution gate remains dormant. There is no assisted UI execution callback,
commit-message draft update, commit, push, consent UI or run lifecycle here.
Ordinary message generation keeps its existing prompt and behavior.

## Public contracts

`CopilotStore.proposeAssistedCommitPlan(account, analysis, repositoryPath, options)`
accepts **only** `IAssistedCommitAnalysis` as change content. Its options carry
the existing `CopilotModelRequest`, repository message rules, an `AbortSignal`
and `mode: 'plan' | 'single-commit'`. It returns a parsed
`CopilotAssistedCommitResponse`, not an executor capability. Neither the snapshot's
private handles nor a live file list can be serialized through this API.

`parseCopilotAssistedCommitResponse(analysis, content, mode)` accepts bare JSON.
`validateCopilotAssistedCommitResponse(analysis, unknownResponse, mode)` provides
the same wire checks for other backends. Both reject unknown fields, executable
properties, malformed/truncated responses, wrong snapshots, invalid titles,
non-string descriptions, unknown IDs, duplicate/missing units and empty groups.
They return immutable data, never paths, patches, blobs or staging operations.
Paths and `oldPath` in analysis are descriptive only.

`planAssistedCommits(snapshot, propose, options)` is backend independent. It
borrows the caller's snapshot and passes only `snapshot.analysis` to `propose`.
It returns the canonical `IValidatedAssistedCommitPlan` capability from
`validateAssistedCommitPlan`. All cumulative trees, exact-once ownership,
selected-file identity, original HEAD and original index are checked before
integration can stage or create any real commit. This helper neither disposes
the snapshot nor executes the returned plan.

Analysis progress is an awaited `onPlanningProgress` observer with
`kind: 'planning' | 'summarizing-selection'` and the number of selected units.
The existing awaited `onProgress` observer receives canonical validation
progress. Model output and these callbacks never imply committed history.
Observer failures stop the operation, including errors whose code happens to
be `unsafe-plan`.

## Outcomes and the only fallback

The wire protocol has three exact shapes:

```json
{
  "kind": "plan",
  "snapshotId": "opaque-snapshot",
  "commits": [
    {
      "title": "Describe only this group's selected changes",
      "description": "Optional body following applicable instructions",
      "changeIds": ["opaque-change"]
    }
  ]
}
```

```json
{
  "kind": "uncertain-boundaries",
  "snapshotId": "opaque-snapshot",
  "title": "Describe the entire selected changeset",
  "description": "Optional whole-selection body"
}
```

```json
{
  "kind": "unsafe",
  "snapshotId": "opaque-snapshot",
  "reason": "Why this selection cannot be described safely"
}
```

Explicit uncertainty becomes a `createSingleAssistedCommitPlan` request with
reason `uncertain-boundaries`, followed by normal full-plan validation.
Explicit unsafe becomes a visible `CopilotAssistedCommitError` with code `unsafe`.
There are no agent-initiated questions.

Only `unsafe-plan` from **canonical cumulative-tree validation of an otherwise
valid multi-commit proposal** permits one additional model turn. That turn gets
all of the original analysis in a new session with `mode: 'single-commit'`.
It must supply a fresh accurate whole-selection message. No first split message,
untrusted previous output or Git error text is inserted into the new prompt.
The helper explicitly creates a single plan with reason `unsafe-split`, then
validates it again. Failure of that validation remains an error; there is no
third turn. Invalid output, auth/quota/timeout errors, cancellation, stale
selection/index/history, disposal and observer errors never trigger fallback.

## Instructions, model selection and authority

The distinct planner prompt does not inherit ordinary generation's 50-character
title preference, optional lockfile exclusion or generic body convention.
Applicable global and repository Copilot instructions control content, language,
message structure and requested trailers. More specific repository conventions
take precedence when they conflict with global conventions. Beyond the wire
schema, the required message invariant is a nonblank single-line title without
NUL. Bodies are optional strings without NUL. Copilot attribution is omitted by
default unless applicable instructions explicitly request it.

SDK 1.0.13 loads the global `copilot-instructions.md` and user instruction
directory from its configured Copilot home, and repository sources from the
repository working directory independently of tool/config discovery. Empty
tool lists alone still allow user-configured MCP processes to start while
initializing tools. The planner therefore uses SDK's read-only instruction
discovery RPCs to capture user instruction sources, then copies only approved
instruction files into an owned private config directory. It preserves their
raw content and relative instruction paths, including scoped frontmatter.
Executable config, MCP definitions, plugins and hooks are never copied.
Session `configDirectory` points at that instruction-only directory; original
user configuration stays unchanged. Unknown/out-of-scope sources fail explicitly
instead of being silently dropped or copied.

The planner retains
`systemMessage.mode: 'append'`, `skipCustomInstructions: false`, and the repository
cwd. Because an explicit SDK environment replaces the inherited environment,
the planner preserves home/Copilot/config directory variables and OS paths,
without forwarding ambient SDK runtime or tool overrides.
Tests launch the shipped runtime with synthetic global/repository instructions,
configured MCP/hook execution sentinels and a completely local fake model. They
assert source metadata/precedence, inclusion before the appended planner boundary,
zero exposed tools and zero configured-process execution.

Scoped instruction files are otherwise only advertised in SDK's instruction
table, and cannot be read by a model whose file tools are disabled. The planner
therefore also fetches the session's SDK instruction-source bodies and supplies
their location/applicability/disabled metadata as tagged user-channel data.
The model can apply those message conventions to each group's assigned paths
without reading any live source files. This data cannot change the schema or
tool/ownership boundary. Plugin instruction sources fail explicitly.

Repository message-rule descriptions reuse existing enforced/bypass filtering,
control-character sanitation and deduplication. Those rules and the complete
analysis are user-channel **data**, surrounded by fresh cryptographically random
per-request tags. Neither diff/rule text nor model/error text enters the trusted
system channel. Custom instructions and rule constraints cannot override the
schema, title invariant or Desktop's authority.

Every session has an empty tool allowlist plus exclusions for all built-in,
MCP and custom tools. Permission requests always reject. Config discovery,
filesystem hooks, host Git context/status, skills, plugins, extensions, canvases,
agent routes, interactive input, schedules, memory, embeddings retrieval,
remote export and cross-session storage are disabled. SDK-added coauthors are
disabled with `coauthorEnabled: false`. Instructions are read by the established
SDK discovery mechanism, not by model file tools. This is a constrained SDK
configuration, not an OS sandbox; Desktop's own Git engine still remains the
canonical safety authority.

Callers reuse the existing commit-message feature's account selection,
organization entitlement gate, consent and model preference. No new picker or
persisted preference is added. Explicit built-in model IDs remain unchanged
when metadata is unavailable; planning borrows already cached metadata and never
starts an unowned shared-cache fetch. Built-in models, including `auto`, leave
reasoning effort undefined so the SDK/model default applies, rather than selecting
the lowest supported effort. BYOK model, provider and explicit effort pass through
unchanged; an absent BYOK effort also retains the SDK/provider default. Ordinary
commit-message generation keeps its existing lowest-effort behavior.
Configured timeouts must be finite, positive and within the runtime timer range,
otherwise they fail explicitly.

## Limits, errors and lifecycle

The complete serialized user prompt has an inclusive 4 MiB UTF-8 protocol limit,
including rules and delimiters. Responses have an inclusive 1 MiB UTF-8 limit.
These are transport/structural bounds, not title style rules or a promise that
every model's context window can fit that input. Nothing is truncated or batched;
smaller model context limits remain observable SDK errors. Automatic compaction
and infinite-session workspaces are disabled.

`CopilotAssistedCommitError` carries `code`, `cause` and `cleanupErrors`.
Codes include `invalid-response`, `unsafe`, `empty-selection`, `prompt-too-large`,
`invalid-request`, `cancelled`, `timed-out` and `cleanup-failed`.
Canonical engine errors retain their original types/codes. Transport/auth
failures propagate unchanged; the existing SDK session-error adapter preserves
402 quota/billing metadata as `CopilotError`. Cleanup failure is not success:
it preserves any earlier request error in `cause` plus the cleanup errors.
Integration should inspect that cause when presenting actionable billing data.

The request deadline covers client setup, SDK instruction discovery, session
creation and model response. Cached model metadata is synchronous; every SDK or
instruction-setup await is cancellable. Cancellation and
timeout force-stop the owned ephemeral runtime; late-created clients/sessions
are disposed. Late cleanup failures are logged because cancellation has already
been delivered, including secondary setup failures. Filesystem setup retains
its late ownership and removes a directory created after cancellation.
Response waiting uses Desktop-owned send/events and the enclosing deadline,
not SDK `sendAndWait`'s independent timer; all response/idle/error/abort listeners
are removed on completion or cancellation. Successful/error cleanup disconnects the session and awaits
client shutdown, bounded to one second before force-stop and an explicit
cleanup failure. Cancellation during cleanup cannot return a successful plan.
Every owned in-memory filesystem is cleared and rejects late reads/writes.
SDK session journals use that filesystem; no per-session content is written to
disk or the shared session store. The instruction-only config is removed after
runtime cleanup on success/error/cancellation. Disposal checks directory
ownership before recursive removal; if the initial ownership lookup fails,
only a still-empty directory can be removed. Any cleanup failure stays visible.

The caller must keep using `withAssistedCommitSnapshot` for snapshot resource
cleanup. The planner never assumes ownership of it.

## Layer 4 integration

Apply existing account eligibility and consent **before** capture or any model
request, resolve the existing commit-message model selection, and pause
index-refreshing status requests while the snapshot is active.
The execution owner can then compose the backend contracts:

```ts
const result = await withAssistedCommitSnapshot(
  repository,
  request,
  async snapshot => {
    const checked =
      snapshot.analysis.changes.length === 0
        ? await validateAssistedCommitPlan(
            snapshot,
            createSingleAssistedCommitPlan(snapshot, {
              reason: 'empty-selection',
              title: callerProvidedEmptyCommitTitle,
            }),
            options
          )
        : await planAssistedCommits(
            snapshot,
            (analysis, mode, signal) =>
              copilotStore.proposeAssistedCommitPlan(
                account,
                analysis,
                snapshot.repositoryPath,
                {
                  request: selectedCommitMessageModel,
                  commitMessageRules,
                  mode,
                  signal,
                }
              ),
            options
          )

    // Only the later execution/integration layer may call this.
    return executeAssistedCommitPlan(snapshot, checked, options)
  },
  options
)

if (options.signal?.aborted) {
  await rollbackAssistedCommitTransaction(result, options)
} else {
  finalizeAssistedCommitTransaction(result)
}
```

Allow-empty must bypass **all model analysis** with an explicit caller title.
Non-empty planner invocation rejects empty analysis even if an integration
accidentally calls it. Keep commit-progress/hook controls, selected-content
checks, visible errors, cancellation, result finalization/rollback and eventual
push/retry in their owning layers. Do not turn a checked plan into a JSON
capability or execute it outside the active snapshot scope.
