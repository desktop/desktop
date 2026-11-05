# Copilot-assisted commit processes

This guide explains the plan-first workflow and the transaction backend that makes assisted commits safe. Desktop owns all Git operations. The planner proposes commit groups and messages; it cannot edit working-tree files or author executable patches.

## High-level process

Every proposed commit is validated before the first commit is published to the real branch. Optional push happens after local acceptance, outside the transaction backend.

```mermaid
flowchart TD
    Request["Selected changes and commit options"]
    Freeze["Freeze selected content"]
    Empty{"Empty selection<br/>and allow-empty enabled?"}
    Plan["Propose commit groups and messages"]
    EmptyPlan["Create caller-titled empty-commit plan"]
    Validate["Validate the complete plan<br/>and every cumulative tree"]
    Execute["Create, verify and publish local commits"]
    Accept["Accept local result<br/>and release rollback capability"]
    Done["Local transaction complete"]
    Recover["Recover owned history, index<br/>and temporary resources"]
    Request --> Freeze --> Empty
    Empty -->|No| Plan --> Validate
    Empty -->|Yes| EmptyPlan --> Validate
    Validate --> Execute --> Accept --> Done
    Freeze -.->|Failure or cancellation| Recover
    Plan -.->|Failure or cancellation| Recover
    Validate -.->|Failure or cancellation| Recover
    Execute -.->|Failure or cancellation| Recover
    Accept -.->|Cancelled before acceptance| Recover
```

## Freeze selected content

The snapshot freezes content and selection boundaries. Later planning and execution do not reread live files to construct commits. Unselected changes are excluded; selected files are checked in their entirety, even when only some lines are selected. Working-tree bytes and the real index remain untouched during capture.

```mermaid
flowchart TD
    Request["Selected files, line selections<br/>and captured commit options"]
    Identity["Resolve repository, Git directory,<br/>HEAD identity and original index"]
    Resources["Create private temporary resources<br/>and register cleanup ownership"]
    Policy["Freeze effective Git configuration,<br/>refs and attribute policy"]
    Bytes["Capture selected-file bytes,<br/>type, mode and filesystem identity"]
    Selection["Construct selected-only blobs<br/>using frozen Git conversion policy"]
    Units["Assign opaque IDs:<br/>selected text hunks or atomic changes"]
    Verify{"HEAD, index and selected files<br/>still match capture?"}
    Snapshot["Return immutable snapshot<br/>and selected-only analysis"]
    Reject["Reject inconsistent or unsupported capture<br/>and clean owned resources"]
    Request --> Identity --> Resources --> Policy
    Policy --> Bytes --> Selection --> Units --> Verify
    Verify -->|Yes| Snapshot
    Verify -->|No| Reject
```

## Propose commit groups and messages

The planner receives only the analysis view, not private snapshot handles or authority to perform Git operations. Supplied units are indivisible: the planner cannot invent finer hunks, author patches, include unselected content, or edit working-tree files.

```mermaid
flowchart TD
    Analysis["Selected-only analysis:<br/>snapshot ID, opaque change IDs and diffs"]
    Instructions["Applicable commit-message instructions<br/>and repository constraints"]
    Planner["Group changes by coherent intent"]
    Outcome{"Planner response"}
    Groups["Ordered commit groups<br/>with titles and assigned change IDs"]
    Whole["One commit with a fresh message<br/>covering the entire selection"]
    Stop["Stop with an explicit error"]
    Validate["Pass proposal to Desktop validation"]
    Analysis --> Planner
    Instructions --> Planner
    Planner --> Outcome
    Outcome -->|Plan| Groups --> Validate
    Outcome -->|Uncertain boundaries| Whole --> Validate
    Outcome -->|Unsafe or malformed response| Stop
```

## Validate the entire plan

Validation checks both logical ownership and actual Git trees. A plausible JSON plan alone is insufficient. Single-commit fallback is for legitimate uncertainty or unsafe split boundaries, not malformed output, missing IDs, authentication errors, or changed selected content. An explicitly allowed empty commit is the exception to the non-empty-delta requirement.

```mermaid
flowchart TD
    Proposal["Proposed commit plan"]
    Shape{"Correct snapshot and allowed fields?<br/>Valid titles and commit groups?<br/>Every selected ID exactly once?"}
    Invalid["Reject as invalid-plan<br/>No automatic fallback"]
    Fresh["Recheck original HEAD,<br/>index and selected-file identity"]
    Trees["Materialize each cumulative tree<br/>from the original frozen base"]
    Safe{"Each commit has a valid delta?<br/>Final tree equals frozen selected tree?"}
    Checked["Return opaque validated-plan capability"]
    Fallback["Caller may supply one fresh<br/>whole-selection message"]
    Error["Stop with explicit error"]
    Proposal --> Shape
    Shape -->|No| Invalid
    Shape -->|Yes| Fresh --> Trees --> Safe
    Safe -->|Yes| Checked
    Safe -->|Unsafe multi-commit boundaries| Fallback
    Fallback --> Proposal
    Safe -->|Other failure| Error
```

## Execute verified local commits

Native commits are first created in the private transaction view. Desktop verifies their contents and parents before publishing each real ref update. Working-tree files are never restored or rewritten by this backend. Hook side effects remain current user changes; unexpected hook-produced commit contents fail verification.

```mermaid
flowchart TD
    Checked["Validated plan and captured options"]
    Messages["Format messages and trailers<br/>with frozen configuration"]
    Lock["Acquire real-index lock<br/>and verify original index"]
    Next["Prepare next prevalidated tree<br/>in private index"]
    Commit["Run native git commit<br/>with captured options and hooks"]
    Hook{"Ignorable hook failure?"}
    Decision["Existing Desktop hook decision"]
    Verify["After Git settles, verify actual commit:<br/>full SHA, expected parent and exact tree"]
    Publish["Publish with guarded ref compare-and-swap<br/>and fresh identity checks"]
    More{"More planned commits?"}
    Sync["Synchronize real index to final selected tree<br/>under HEAD/ref ownership guard"]
    Result["Dispose private files and return result<br/>Retain in-memory rollback capability"]
    Recover["Recover the transaction"]
    Checked --> Messages --> Lock --> Next --> Commit
    Commit --> Hook
    Hook -->|No| Verify
    Hook -->|Yes| Decision
    Decision -->|Ignore: continue current operation| Commit
    Decision -->|Decline| Recover
    Verify --> Publish --> More
    More -->|Yes| Next
    More -->|No| Sync --> Result
    Verify -.->|Failure or cancellation| Recover
    Publish -.->|Failure or cancellation| Recover
    Sync -.->|Failure or cancellation| Recover
```

Ignoring a hook failure resumes the current native operation through Desktop's hook interception; it does not start an extra planned commit. The diagram abbreviates the hook callback inside that operation. In-flight Git must settle before recovery inspects its actual outcome. The `committed` progress event is not transaction completion: callers must await the executor result.

## Accept or roll back the completed result

Successful execution is not yet irreversible acceptance. The caller retains the option to cancel after the last local commit. Finalization performs no Git mutation and refuses to discard unresolved owned-resource obligations. Once a remote push attempt starts, orchestration must preserve local commits rather than roll them back.

```mermaid
flowchart TD
    Result["Executor returns successful local result<br/>with retained rollback capability"]
    Decision{"Caller accepts result?<br/>Cancellation checked first"}
    Rollback["rollbackAssistedCommitTransaction<br/>Recheck ownership and undo only this run"]
    Finalize["finalizeAssistedCommitTransaction<br/>Release in-memory rollback capability"]
    Restored["Original owned history/index restored<br/>Current working-tree bytes preserved"]
    Accepted["Local commits accepted"]
    Later["Return ready, or begin optional push"]
    Result --> Decision
    Decision -->|Cancelled before acceptance| Rollback --> Restored
    Decision -->|Accept| Finalize --> Accepted --> Later
```

## Recover failures and retry cleanup

Transaction recovery and temporary-resource cleanup are separate capabilities. A cleanup-only capability exists even when capture fails before a snapshot is returned. It cannot change HEAD, the index, or working-tree files, and cannot substitute for outstanding transaction rollback.

```mermaid
flowchart TD
    Failure["Capture, planning, validation<br/>or execution failed"]
    Full{"Full transaction recovery<br/>still required?"}
    Rollback["Recover using result or recovery.retryToken<br/>Verify original ref, owned tip and index"]
    Owned{"History/index ownership<br/>and cleanup checks succeed?"}
    Attention["Retain recovery capability and errors<br/>Do not overwrite external changes"]
    Temp{"Owned temporary cleanup<br/>still pending?"}
    Cleanup["retryAssistedCommitCleanup<br/>Verify temporary-directory identity only"]
    Removed{"Owned resources removed?"}
    Pending["Retain same cleanup token<br/>and original failure causes"]
    Complete["Recovery or cleanup complete<br/>Reconcile selection with current files"]
    Failure --> Full
    Full -->|Yes| Rollback --> Owned
    Owned -->|No| Attention
    Attention -->|Retry after interference is addressed| Rollback
    Owned -->|Yes| Temp
    Full -->|No| Temp
    Temp -->|No| Complete
    Temp -->|Yes| Cleanup --> Removed
    Removed -->|Yes| Complete
    Removed -->|No| Pending
    Pending -->|Retry after filesystem fault is addressed| Cleanup
```

For detailed contracts, supported selections, hook behavior and ownership checks, see [Assisted commit transactions](assisted-commit-transactions.md).
