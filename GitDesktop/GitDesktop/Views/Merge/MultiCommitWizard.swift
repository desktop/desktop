import SwiftUI

// MARK: - MultiCommitWizard
// SwiftUI for the Task 6 rebase/cherry-pick/squash/reorder flows. Ports
// `ui/multi-commit-operation/choose-branch/rebase-choose-branch-dialog.tsx`
// (target picker + preview), `dialog/progress-dialog.tsx`,
// `dialog/warn-force-push-dialog.tsx`, `dialog/confirm-abort-dialog.tsx` and
// the `continue-rebase` CTA in `ui/changes/continue-rebase.tsx`.
//
// Like the Task 5 views, these take explicit props + callbacks and never touch
// `AppStore`, so the shell (Task 2) can present them from `.sheet(item:)` and
// drive them from `MockMultiCommitService`.

/// Step router for a rebase/cherry-pick/squash/reorder flow. The conflicts
/// step reuses Task 5's unmerged-file rows; `conflictFiles` here are the
/// lightweight Task 6 values converted at the seam.
public struct MultiCommitWizardView: View {
    var step: MultiCommitOperationStep
    var currentBranch: Branch
    var branches: [Branch]
    var conflictFiles: [MultiCommitConflictFile]
    var progress: MultiCommitProgress?
    var askForConfirmationOnForcePush: Bool
    var onPickBaseBranch: ((Branch) -> Void)?
    var onBegin: (() -> Void)?
    var onConfirmForcePushSetting: ((Bool) -> Void)?
    var onContinue: (() -> Void)?
    var onAbort: (() -> Void)?
    var onConfirmAbort: (() -> Void)?
    var onReturnToConflicts: (() -> Void)?
    var onDismiss: (() -> Void)?

    public init(
        step: MultiCommitOperationStep,
        currentBranch: Branch,
        branches: [Branch] = [],
        conflictFiles: [MultiCommitConflictFile] = [],
        progress: MultiCommitProgress? = nil,
        askForConfirmationOnForcePush: Bool = true,
        onPickBaseBranch: ((Branch) -> Void)? = nil,
        onBegin: (() -> Void)? = nil,
        onConfirmForcePushSetting: ((Bool) -> Void)? = nil,
        onContinue: (() -> Void)? = nil,
        onAbort: (() -> Void)? = nil,
        onConfirmAbort: (() -> Void)? = nil,
        onReturnToConflicts: (() -> Void)? = nil,
        onDismiss: (() -> Void)? = nil
    ) {
        self.step = step
        self.currentBranch = currentBranch
        self.branches = branches
        self.conflictFiles = conflictFiles
        self.progress = progress
        self.askForConfirmationOnForcePush = askForConfirmationOnForcePush
        self.onPickBaseBranch = onPickBaseBranch
        self.onBegin = onBegin
        self.onConfirmForcePushSetting = onConfirmForcePushSetting
        self.onContinue = onContinue
        self.onAbort = onAbort
        self.onConfirmAbort = onConfirmAbort
        self.onReturnToConflicts = onReturnToConflicts
        self.onDismiss = onDismiss
    }

    public var body: some View {
        switch step {
        case .chooseBranch(let kind):
            RebaseChooseBranchView(
                operation: kind,
                currentBranch: currentBranch,
                branches: branches,
                onSelect: { onPickBaseBranch?($0) },
                onBegin: { onBegin?() },
                onDismiss: { onDismiss?() })
        case .warnForcePush(let kind):
            WarnForcePushView(
                operation: kind,
                askForConfirmationOnForcePush: askForConfirmationOnForcePush,
                onBegin: { onBegin?() },
                onConfirmSetting: { onConfirmForcePushSetting?($0) },
                onDismiss: { onDismiss?() })
        case .showProgress(let kind, let stepProgress):
            MultiCommitProgressView(
                operation: kind,
                progress: stepProgress ?? progress)
        case .showConflicts(let kind, let files),
             .hideConflicts(let kind, let files):
            MultiCommitConflictsView(
                operation: kind,
                files: files.isEmpty ? conflictFiles : files,
                onContinue: { onContinue?() },
                onAbort: { onAbort?() },
                onDismiss: { onDismiss?() })
        case .confirmAbort(let kind, let hasResolved):
            ConfirmAbortOperationView(
                operation: kind,
                hasResolvedConflicts: hasResolved,
                onConfirmAbort: { onConfirmAbort?() },
                onReturnToConflicts: { onReturnToConflicts?() })
        case .done:
            EmptyView()
        }
    }
}

// MARK: Choose branch

/// Rebase target picker. Port of `rebase-choose-branch-dialog.tsx`: branch
/// list + live preview (fast-forward vs apply-on-top vs up-to-date) + Start
/// button gated by `canStartOperation`, with the same tooltip copy.
public struct RebaseChooseBranchView: View {
    var operation: MultiCommitOperationKind
    var currentBranch: Branch
    var branches: [Branch]
    var aheadCount: Int?
    var behindCount: Int?
    var previewLoading: Bool
    var previewInvalid: Bool
    var onSelect: ((Branch) -> Void)?
    var onBegin: (() -> Void)?
    var onDismiss: (() -> Void)?

    @State private var selectedBranchID: String?
    @State private var filterText: String = ""

    public init(
        operation: MultiCommitOperationKind = .rebase,
        currentBranch: Branch,
        branches: [Branch] = [],
        aheadCount: Int? = nil,
        behindCount: Int? = nil,
        previewLoading: Bool = false,
        previewInvalid: Bool = false,
        onSelect: ((Branch) -> Void)? = nil,
        onBegin: (() -> Void)? = nil,
        onDismiss: (() -> Void)? = nil
    ) {
        self.operation = operation
        self.currentBranch = currentBranch
        self.branches = branches
        self.aheadCount = aheadCount
        self.behindCount = behindCount
        self.previewLoading = previewLoading
        self.previewInvalid = previewInvalid
        self.onSelect = onSelect
        self.onBegin = onBegin
        self.onDismiss = onDismiss
    }

    private var selectedBranch: Branch? {
        branches.first { $0.id == selectedBranchID }
    }

    private var canStart: Bool {
        canStartOperation(
            selectedBranch: selectedBranch,
            currentBranch: currentBranch,
            commitCount: behindCount,
            hasConflictsPreview: false,
            isInvalidPreview: previewInvalid)
    }

    private var startDisabledReason: String? {
        if selectedBranch == nil { return nil }
        if selectedBranch?.name == currentBranch.name {
            return "You are not able to rebase this branch onto itself."
        }
        if (behindCount ?? 0) <= 0 {
            return "The current branch is already up to date with the selected branch."
        }
        return nil
    }

    private var filtered: [Branch] {
        let query = filterText.trimmingCharacters(in: .whitespaces)
        guard !query.isEmpty else { return branches }
        return branches.filter { $0.name.localizedCaseInsensitiveContains(query) }
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Rebase \(currentBranch.name)")
                .font(.headline)
            TextField("Filter branches", text: $filterText)
                .textFieldStyle(.roundedBorder)
            List(filtered, id: \.id, selection: $selectedBranchID) { branch in
                Text(branch.name)
                    .tag(branch.id)
            }
            .frame(minHeight: 160)
            previewMessage
            HStack {
                Spacer()
                Button("Cancel") { onDismiss?() }
                    .keyboardShortcut(.cancelAction)
                Button("Start rebase") { onBegin?() }
                    .keyboardShortcut(.defaultAction)
                    .disabled(!canStart)
                    .help(startDisabledReason ?? "")
            }
        }
        .padding()
        .frame(minWidth: 380)
        .onChange(of: selectedBranchID) { _, newValue in
            if let branch = branches.first(where: { $0.id == newValue }) {
                onSelect?(branch)
            }
        }
        .accessibilityLabel("Rebase \(currentBranch.name)")
    }

    @ViewBuilder
    private var previewMessage: some View {
        if previewLoading {
            Text("Checking for ability to rebase automatically…")
                .foregroundStyle(.secondary)
        } else if previewInvalid, selectedBranch != nil {
            Text("Unable to start rebase. Check you have chosen a valid branch.")
                .foregroundStyle(.secondary)
        } else if let base = selectedBranch,
                  let ahead = aheadCount, let behind = behindCount {
            rebasePreviewText(current: currentBranch, base: base, ahead: ahead, behind: behind)
                .foregroundStyle(.secondary)
        }
    }

    @ViewBuilder
    private func rebasePreviewText(current: Branch, base: Branch, ahead: Int, behind: Int) -> some View {
        if behind > 0, ahead <= 0 {
            Text("This will fast-forward \(current.name) by \(behind) \(behind == 1 ? "commit" : "commits") to match \(base.name).")
        } else if behind > 0, ahead > 0 {
            Text("This will update \(current.name) by applying its \(ahead) \(ahead == 1 ? "commit" : "commits") on top of \(base.name).")
        } else {
            Text("\(current.name) is already up to date with \(base.name).")
        }
    }
}

// MARK: Progress

/// Progress dialog. Port of `progress-dialog.tsx`: non-dismissable, shows a
/// bar plus `Commit n of m` and the current commit summary.
public struct MultiCommitProgressView: View {
    var operation: MultiCommitOperationKind
    var progress: MultiCommitProgress?

    public init(operation: MultiCommitOperationKind, progress: MultiCommitProgress? = nil) {
        self.operation = operation
        self.progress = progress
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(operation.progressTitle)
                .font(.headline)
            if let progress {
                ProgressView(value: progress.value)
                    .accessibilityLabel("\(operation.rawValue) progress")
                    .accessibilityValue("\(progress.position) of \(progress.totalCommitCount)")
                HStack(alignment: .top, spacing: 8) {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(.green)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(progress.detailLine)
                            .font(.callout)
                        if !progress.currentCommitSummary.isEmpty {
                            Text(progress.currentCommitSummary)
                                .font(.callout)
                                .foregroundStyle(.secondary)
                                .lineLimit(2)
                        }
                    }
                }
            } else {
                ProgressView()
                    .progressViewStyle(.linear)
            }
        }
        .padding()
        .frame(minWidth: 340)
        .accessibilityElement(children: .combine)
    }
}

// MARK: Warn force-push

/// Force-push warning shown before history-rewriting ops. Port of
/// `warn-force-push-dialog.tsx` (the GitHub-specific sentence is reworded —
/// no GitHub integration per scope — while keeping the force-push warning).
public struct WarnForcePushView: View {
    var operation: MultiCommitOperationKind
    var askForConfirmationOnForcePush: Bool
    var onBegin: (() -> Void)?
    var onConfirmSetting: ((Bool) -> Void)?
    var onDismiss: (() -> Void)?

    @State private var askAgain: Bool

    public init(
        operation: MultiCommitOperationKind,
        askForConfirmationOnForcePush: Bool = true,
        onBegin: (() -> Void)? = nil,
        onConfirmSetting: ((Bool) -> Void)? = nil,
        onDismiss: (() -> Void)? = nil
    ) {
        self.operation = operation
        self.askForConfirmationOnForcePush = askForConfirmationOnForcePush
        self._askAgain = State(initialValue: askForConfirmationOnForcePush)
        self.onBegin = onBegin
        self.onConfirmSetting = onConfirmSetting
        self.onDismiss = onDismiss
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("\(operation.rawValue) Will Require Force Push")
                .font(.headline)
            Text("Are you sure you want to \(operation.rawValue.lowercased())?")
            Text("At the end of the \(operation.rawValue.lowercased()) flow you will be able to force push the branch to update the upstream branch. Force pushing will alter the history on the remote and potentially cause problems for others collaborating on this branch.")
                .foregroundStyle(.secondary)
            Toggle("Do not show this message again", isOn: Binding(
                get: { !askAgain },
                set: { askAgain = !$0 }))
                .toggleStyle(.checkbox)
            HStack {
                Spacer()
                Button("Cancel") { onDismiss?() }
                    .keyboardShortcut(.cancelAction)
                Button("Begin \(operation.rawValue)") {
                    onConfirmSetting?(askAgain)
                    Defaults.setBool(askAgain, Defaults.confirmForcePush)
                    onBegin?()
                }
                .keyboardShortcut(.defaultAction)
            }
        }
        .padding()
        .frame(minWidth: 400)
        .accessibilityLabel("\(operation.rawValue) will require force push")
    }
}

// MARK: Confirm abort

/// Abort confirmation, only shown when conflicts were already resolved
/// (`confirm-abort-dialog.tsx` + `shouldConfirmAbort`).
public struct ConfirmAbortOperationView: View {
    var operation: MultiCommitOperationKind
    var hasResolvedConflicts: Bool
    var onConfirmAbort: (() -> Void)?
    var onReturnToConflicts: (() -> Void)?

    @State private var isAborting = false

    public init(
        operation: MultiCommitOperationKind,
        hasResolvedConflicts: Bool = false,
        onConfirmAbort: (() -> Void)? = nil,
        onReturnToConflicts: (() -> Void)? = nil
    ) {
        self.operation = operation
        self.hasResolvedConflicts = hasResolvedConflicts
        self.onConfirmAbort = onConfirmAbort
        self.onReturnToConflicts = onReturnToConflicts
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Confirm Abort \(operation.rawValue)")
                .font(.headline)
            Text("Are you sure you want to abort this \(operation.rawValue.lowercased())?")
            Text("This will take you back to the original branch state and the conflicts you have already resolved will be discarded.")
                .foregroundStyle(.secondary)
            HStack {
                Spacer()
                Button("Back to conflicts") { onReturnToConflicts?() }
                    .keyboardShortcut(.cancelAction)
                Button("Abort \(operation.rawValue)") {
                    isAborting = true
                    onConfirmAbort?()
                }
                .keyboardShortcut(.defaultAction)
                .disabled(isAborting || !hasResolvedConflicts)
            }
        }
        .padding()
        .frame(minWidth: 380)
    }
}

// MARK: Conflicts summary

/// Conflicts step body: file list is rendered by Task 5's unmerged-file rows;
/// this view shows the operation headline, counts and Continue/Abort actions
/// (mirrors `conflicts-dialog.tsx` without the Copilot section).
public struct MultiCommitConflictsView: View {
    var operation: MultiCommitOperationKind
    var files: [MultiCommitConflictFile]
    var onContinue: (() -> Void)?
    var onAbort: (() -> Void)?
    var onDismiss: (() -> Void)?

    public init(
        operation: MultiCommitOperationKind,
        files: [MultiCommitConflictFile] = [],
        onContinue: (() -> Void)? = nil,
        onAbort: (() -> Void)? = nil,
        onDismiss: (() -> Void)? = nil
    ) {
        self.operation = operation
        self.files = files
        self.onContinue = onContinue
        self.onAbort = onAbort
        self.onDismiss = onDismiss
    }

    private var unresolvedCount: Int { files.filter { !$0.isResolved }.count }

    public var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Resolve conflicts to continue \(operation.operationPrefix)")
                .font(.headline)
            Text(unresolvedCount == 1 ? "1 conflicted file" : "\(unresolvedCount) conflicted files")
                .foregroundStyle(.secondary)
            ForEach(files) { file in
                HStack {
                    Image(systemName: file.isResolved ? "checkmark.circle.fill" : "exclamationmark.triangle")
                        .foregroundStyle(file.isResolved ? .green : .orange)
                    Text(file.path)
                        .lineLimit(1)
                }
            }
            HStack {
                Button("Abort") { onAbort?() }
                Spacer()
                Button("Hide") { onDismiss?() }
                Button("Continue") { onContinue?() }
                    .keyboardShortcut(.defaultAction)
                    .disabled(unresolvedCount > 0)
            }
        }
        .padding()
        .frame(minWidth: 380)
    }
}

// MARK: Continue CTA

/// Banner-row CTA shown in Changes while a rebase/cherry-pick is paused on
/// conflicts. Port of `ui/changes/continue-rebase.tsx` + the
/// `rebase-conflicts-banner`/`cherry-pick-conflicts-banner` "View conflicts"
/// reopen action.
public struct ContinueOperationCTAView: View {
    var operation: MultiCommitOperationKind
    var targetBranch: String
    var onViewConflicts: (() -> Void)?
    var onContinue: (() -> Void)?
    var onAbort: (() -> Void)?

    public init(
        operation: MultiCommitOperationKind,
        targetBranch: String,
        onViewConflicts: (() -> Void)? = nil,
        onContinue: (() -> Void)? = nil,
        onAbort: (() -> Void)? = nil
    ) {
        self.operation = operation
        self.targetBranch = targetBranch
        self.onViewConflicts = onViewConflicts
        self.onContinue = onContinue
        self.onAbort = onAbort
    }

    public var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(.orange)
            Text("Resolve conflicts to continue \(operation.operationPrefix) \(targetBranch).")
                .font(.callout)
            Spacer()
            Button("View conflicts") { onViewConflicts?() }
                .buttonStyle(.link)
            Button("Continue") { onContinue?() }
            Button("Abort") { onAbort?() }
        }
        .padding(8)
        .accessibilityLabel("Resolve conflicts to continue \(operation.operationPrefix) \(targetBranch)")
    }
}
