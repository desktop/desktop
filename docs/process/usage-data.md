# GitHub Desktop usage reporting

GitHub Desktop sends certain optional metrics to our analytics system. We want you to understand what is being sent and why this information is important to our ability to improve the product.

## Why do we need usage stats?

**Our team uses metrics to prioritize our work and evaluate whether we are successfully solving real users' problems.** For example, when we released dark theme and a guided way to resolve merge conflicts, we wanted to understand whether people were using those features and whether they provided value.

As a concrete example, suppose we release a feature intended to improve merge conflict resolution. If the percentage of conflicts resolved successfully rises by 20%, that indicates the feature is helping people. Conversely, if the percentage drops by 5%, we know it's time to revisit the feature and assess whether we should iterate or try a different solution. You can see an example of how we think about metrics in [desktop/desktop#5394](https://github.com/desktop/desktop/issues/5394).

**The more people who opt in to send GitHub Desktop usage stats, the more information we have to inform our decisions.** If you want us to take your use cases into consideration, we hope you'll opt in so we can better understand how you use the app and whether it meets your needs.

We are sensitive to the privacy of our users. We examine aggregate data and trends to inform product decisions rather than the activity of specific individuals.

## What usage data does GitHub Desktop send?

If you opt in to usage reporting, the payload contains a pseudonymous `guid` identifier associated with the GitHub Desktop installation. It does not contain your GitHub username or account ID.

GitHub Desktop sends requests in the format shown in our [generated example usage data](./usage-data.json). The field names, value types, and request structure match the application's current implementation. Values such as `1` and `"example"` are synthetic and do not represent data from a real user or device.

Notification metrics distinguish the in-app preference (`notificationsEnabled`) from OS permission (`notificationsPermission`). Permission is reported as `true` when the OS allows notifications, `false` when denied or undecided, or `null` when a permission lookup fails or notifications are unavailable. Windows `default` permission is treated as allowed; macOS and HTML5 `default` permission is not. Lookup failures are logged and do not prevent usage reporting; notifications with unknown permission do not increment shown counts. The legacy endpoint sends boolean or null values; the new endpoint serializes dimensions as `"true"`, `"false"`, or `"null"`.

For checks failed, PR reviews, and PR comments, existing `NotificationCount` measures count eligible server-side events. Corresponding `NotificationShownCount` measures count notifications successfully accepted with OS permission (or confirmed by the HTML5 `show` event). Native notification APIs do not confirm that a banner was visible; OS settings such as Focus mode can still suppress it. Clicks and events for other repositories do not increment these shown counts.

Copilot-based features track their own metrics separately. GitHub Desktop relies on the [GitHub Copilot SDK](https://docs.github.com/en/copilot/responsible-use/copilot-cli) for those features. You can learn more in the [GitHub Copilot Trust Center](https://copilot.github.trust.page/).

### Assisted commit counts

The generated example includes 28 numeric daily measures for assisted commits and their Manual comparison. All default to zero, including when reading older daily records. These are interaction and workflow counts within the existing reporting period, not unique-user counts. No commit-mode-enabled dimension or shown count is sent.

- `commitModeDropdownOpenedCount` counts actual openings of the Manual/Commit with Copilot dropdown by mouse or keyboard. Reopening counts again; rendering, closing, disabled input and other dropdowns do not count.
- `commitModeSwitchedToCopilotCount` and `commitModeSwitchedToManualCount` count real user-driven changes. Restoring preferences, automatic fallback, repository changes and selecting the current mode do not count.
- `copilotAssistedCommitStartedCount`, `copilotAssistedCommitPlanningStartedCount`, `copilotAssistedCommitPlanValidatedCount` and `copilotAssistedCommitExecutionStartedCount` count admitted non-empty workflows and the boundaries they reach. Planning starts at SDK request dispatch, after local prompt validation and client/session setup. Duplicate starts and model/recovery retries are not new workflows.
- `copilotAssistedCommitAcceptedCount` counts verified local acceptance, once per non-empty workflow, independent of Push. `copilotAssistedCommitCreatedCommitCount` counts its commits; `copilotAssistedCommitMultiCommitRunCount` counts accepted workflows producing more than one. Temporary or rolled-back commits do not count.
- `copilotAssistedCommitCancelledCount`, `copilotAssistedCommitConsentDeclinedCount` and `copilotAssistedCommitErrorCount` distinguish explicit user cancellation (including aborting a hook decision), declined assisted consent and unexpected failure. Authorization-driven stops, including sign-out, revoked access, session retirement and repository account reassignment, count as errors rather than user cancellation unless the user had already explicitly cancelled. An unresolved run is classified once at its initial settlement; recovery retries never add another workflow outcome. Cancellation or decline with unresolved recovery retains that outcome and also records recovery diagnostics. Declined consent is retained even when changed selected inputs require refresh and reselection. Post-acceptance presentation, statistics or Push errors do not change acceptance into failure.
- `copilotAssistedCommitEmptyCommitCount` counts successful explicit empty commits in assisted mode. These do not increment AI workflow, output, recovery or duration counts.
- `copilotAssistedCommitFallbackCount` counts an explicit single-commit fallback for uncertain boundaries or an unsafe split, once per workflow. An intentional valid one-commit plan is not a fallback.
- `copilotAssistedCommitSelectionChangedCount`, `copilotAssistedCommitRepositoryChangedCount`, `copilotAssistedCommitPlanRejectedCount` and `copilotAssistedCommitCommitVerificationFailedCount` count bounded diagnoses: changed selected input; external HEAD/branch/index changes; rejected coverage or unsafe cumulative trees; and unexpected actual commit tree/parent or hook-modified index. Each diagnosis counts at most once per workflow, including an unsafe split subsequently replaced by a valid single-commit plan. Diagnoses first discovered during automatic rollback count at initial settlement, without requiring a recovery retry. Branch-only drift does not count as a selected-file change; independently diagnosed file and repository changes can both count.
- `copilotAssistedCommitRecoveryRequiredCount` counts workflows retaining rollback or cleanup obligations, once. `copilotAssistedCommitRecoveryAttemptCount`, `copilotAssistedCommitRecoverySuccessCount` and `copilotAssistedCommitRecoveryErrorCount` count actual automatic or user-retried rollback/exceptional-cleanup attempts and their results. Ordinary successful disposal, no-op cleanup, dismissing an error and refresh-only retries are not recovery attempts. Recovery results describe native rollback/cleanup, not later UI refresh. These diagnostics are subsets, not additional workflow outcomes, and do not establish data loss or saved work.
- `copilotAssistedCommitOver15sCount`, `copilotAssistedCommitOver30sCount`, `copilotAssistedCommitOver60sCount` and `copilotAssistedCommitOver120sCount` are cumulative strict processing-time thresholds for accepted non-empty workflows. For example, 70 seconds increments the first three. Monotonic time runs from admission through local acceptance, excluding awaited consent and hook-decision waits, but including model and native hook processing. Raw timestamps and durations are not persisted.
- `manualCommitWorkflowCount` counts successful ordinary non-empty Manual commit actions once, not once per assisted output. Empty commits, amendments, merges, conflicts and history-rewrite continuations are excluded. Classification reads Git operation markers without an extra full worktree status scan when Push is not requested. Existing generic per-commit statistics are unchanged.

These counts use the existing optional usage-reporting pipeline. They add no code, paths, messages, URLs, credentials, raw errors, model/provider breakdowns, identifiers or destinations to the payload.

## Enable or disable usage reporting

You can change your usage-reporting preference at any time. Open GitHub Desktop's settings, select **Advanced**, and enable or disable the option to share usage data.
