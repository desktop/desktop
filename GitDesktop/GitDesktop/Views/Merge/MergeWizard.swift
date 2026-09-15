import SwiftUI

// MARK: - MergeWizard
// Port of `multi-commit-operation/merge.tsx` + `choose-branch/`
// `merge-choose-branch-dialog.tsx` + `dialog/progress-dialog.tsx` +
// `dialog/conflicts-dialog.tsx` (Copilot variants deleted per scope).
// Flow: choose-branch → progress → conflicts → banner + Undo.
// `MergeService` is injected; previews and Task 5 acceptance use
// `MockMergeService`. Banner/popup emission goes through callbacks so Task 2's
// hosts can wire them later.

public struct MergeWizardView<Service: MergeService>: View {
    var repositoryPath: String
    var ourBranch: Branch
    var allBranches: [Branch]
    var recentBranches: [Branch]
    var defaultBranch: Branch?
    var service: Service
    @State private var state: MergeWizardState
    @State private var pickedBranchName: String?
    @State private var squash: Bool = false
    @State private var mergeability: MergeTreeResult = .loading
    @State private var task: Task<Void, Never>?
    var onBanner: ((Banner) -> Void)?
    var onShowPopup: ((Popup) -> Void)?
    var onFinished: ((MergeResult) -> Void)?
    var onCancel: (() -> Void)?

    public init(
        repositoryPath: String,
        ourBranch: Branch,
        allBranches: [Branch],
        recentBranches: [Branch] = [],
        defaultBranch: Branch? = nil,
        service: Service,
        onBanner: ((Banner) -> Void)? = nil,
        onShowPopup: ((Popup) -> Void)? = nil,
        onFinished: ((MergeResult) -> Void)? = nil,
        onCancel: (() -> Void)? = nil
    ) {
        self.repositoryPath = repositoryPath
        self.ourBranch = ourBranch
        self.allBranches = allBranches
        self.recentBranches = recentBranches
        self.defaultBranch = defaultBranch
        self.service = service
        self._state = State(initialValue: MergeWizardState(ourBranchName: ourBranch.name))
        self.onBanner = onBanner
        self.onShowPopup = onShowPopup
        self.onFinished = onFinished
        self.onCancel = onCancel
    }

    public var body: some View {
        Group {
            switch state.step {
            case .chooseBranch:
                chooseBranchStep
            case .showProgress:
                progressStep
            case .showConflicts, .hideConflicts:
                conflictsStep
            case .confirmAbort(let hasResolved):
                confirmAbortStep(hasResolvedConflicts: hasResolved)
            case .done(let result):
                doneStep(result: result)
            }
        }
        .frame(minWidth: 440)
        .onDisappear { task?.cancel() }
    }

    // MARK: Choose branch

    private var eligibleBranches: [Branch] {
        allBranches.filter { $0.type == .local && $0.ref != ourBranch.ref }
    }

    private var chooseBranchStep: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Merge into \(ourBranch.name)")
                .font(.headline)
            Text("Select the branch to merge into the current branch.")
                .font(.callout)
                .foregroundStyle(.secondary)
            Picker("Branch", selection: $pickedBranchName) {
                Text("Select a branch").tag(nil as String?)
                ForEach(eligibleBranches) { branch in
                    Text(branch.name).tag(branch.name as String?)
                }
            }
            .pickerStyle(.menu)
            .labelsHidden()
            .accessibilityLabel("Branch to merge")
            .onChange(of: pickedBranchName) { _, _ in refreshMergeability() }
            mergeabilityRow
            Toggle("Squash merge", isOn: $squash)
            HStack {
                Spacer()
                Button("Cancel", role: .cancel) { onCancel?() }
                    .keyboardShortcut(.cancelAction)
                Button("Merge") { startMerge() }
                    .keyboardShortcut(.defaultAction)
                    .buttonStyle(.borderedProminent)
                    .disabled(pickedBranchName == nil || mergeability == .invalid || mergeability == .loading)
            }
        }
        .padding(16)
        .onAppear { refreshMergeability() }
    }

    @ViewBuilder
    private var mergeabilityRow: some View {
        switch mergeability {
        case .loading:
            HStack(spacing: 6) {
                ProgressView().controlSize(.small)
                Text("Checking for conflicts…").font(.callout).foregroundStyle(.secondary)
            }
        case .clean:
            HStack(spacing: 6) {
                Image(systemName: "checkmark.circle.fill").foregroundStyle(.green)
                Text("No conflicts expected.").font(.callout).foregroundStyle(.secondary)
            }
        case .conflicts(let n):
            HStack(spacing: 6) {
                Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.orange)
                Text(n == 1 ? "1 conflicted file expected." : "\(n) conflicted files expected.")
                    .font(.callout).foregroundStyle(.secondary)
            }
        case .invalid:
            HStack(spacing: 6) {
                Image(systemName: "xmark.circle.fill").foregroundStyle(.red)
                Text("These branches have unrelated histories.").font(.callout).foregroundStyle(.secondary)
            }
        }
    }

    private func refreshMergeability() {
        task?.cancel()
        guard let picked = pickedBranchName,
              let theirBranch = eligibleBranches.first(where: { $0.name == picked })
        else {
            mergeability = .loading
            return
        }
        mergeability = .loading
        task = Task {
            do {
                let result = try await service.determineMergeability(
                    repositoryPath: repositoryPath,
                    oursSHA: ourBranch.tip.sha,
                    theirsSHA: theirBranch.tip.sha)
                await MainActor.run { mergeability = result }
            } catch {
                await MainActor.run { mergeability = .invalid }
            }
        }
    }

    private func startMerge() {
        guard let picked = pickedBranchName else { return }
        state = mergeWizardReduce(state, .chooseBranch(name: picked, squash: squash))
        state = mergeWizardReduce(state, .mergeStarted)
        task?.cancel()
        task = Task {
            do {
                let result = try await service.merge(
                    repositoryPath: repositoryPath,
                    branch: picked,
                    options: MergeOptions(squash: squash))
                await MainActor.run { handleMergeResult(result) }
            } catch {
                await MainActor.run {
                    state = mergeWizardReduce(state, .mergeSucceeded(.failed))
                    onBanner?(.conflictsFound(operationDescription: "merging \(picked)", actionToken: UUID()))
                }
            }
        }
    }

    private func handleMergeResult(_ result: MergeResult) {
        switch result {
        case .success:
            state = mergeWizardReduce(state, .mergeSucceeded(.success))
            onBanner?(.successfulMerge(ourBranch: ourBranch.name, theirBranch: state.theirBranchName))
            onFinished?(.success)
        case .alreadyUpToDate:
            state = mergeWizardReduce(state, .mergeSucceeded(.alreadyUpToDate))
            onBanner?(.branchAlreadyUpToDate(ourBranch: ourBranch.name, theirBranch: state.theirBranchName))
            onFinished?(.alreadyUpToDate)
        case .failed:
            // Conflicted: surface placeholder unmerged rows; the host refreshes
            // real status after the wizard reports the conflict banner.
            let placeholder = [UnmergedFileEntry(path: "Conflicts detected — refresh status", status: .manual(summary: "Manual conflict"))]
            state = mergeWizardReduce(state, .mergeConflicted(files: placeholder))
            onBanner?(.mergeConflictsFound(
                ourBranch: ourBranch.name,
                popup: .multiCommitOperation(repositoryID: 0)))
        }
    }

    // MARK: Progress

    private var progressStep: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Merging…")
                .font(.headline)
            if let progress = state.progress {
                ProgressView(value: progress.value) {
                    Text(progress.title ?? "Merging…")
                }
                .accessibilityLabel(progress.title ?? "Merging")
            } else {
                ProgressView()
            }
            HStack {
                Spacer()
                Button("Cancel") {
                    task?.cancel()
                    onCancel?()
                }
            }
        }
        .padding(16)
    }

    // MARK: Conflicts

    private var conflictsStep: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Conflicts")
                .font(.headline)
            Text("Resolve conflicts to continue merging into \(ourBranch.name).")
                .font(.callout)
                .foregroundStyle(.secondary)
            UnmergedFilesView(
                files: state.unmergedFiles,
                ourBranchName: ourBranch.name,
                theirBranchName: state.theirBranchName ?? "",
                onUseOurs: { path in
                    Task { try? await service.checkoutSide(repositoryPath: repositoryPath, paths: [path], side: .ours) }
                    state = mergeWizardReduce(state, .resolveFile(path: path, resolution: .ours))
                },
                onUseTheirs: { path in
                    Task { try? await service.checkoutSide(repositoryPath: repositoryPath, paths: [path], side: .theirs) }
                    state = mergeWizardReduce(state, .resolveFile(path: path, resolution: .theirs))
                },
                onMarkResolved: { path in
                    state = mergeWizardReduce(state, .markMarkersResolved(path: path))
                },
                onUndoResolution: { path in
                    state = mergeWizardReduce(state, .undoFileResolution(path: path))
                },
                onRevealInFinder: { _ in }
            )
            HStack {
                Button("Abort merge", role: .destructive) {
                    state = mergeWizardReduce(state, .requestAbort)
                }
                Spacer()
                Button("Hide") {
                    state = mergeWizardReduce(state, .hideConflicts)
                }
                Button("Continue") {
                    state = mergeWizardReduce(state, .mergeSucceeded(.success))
                    onBanner?(.successfulMerge(ourBranch: ourBranch.name, theirBranch: state.theirBranchName))
                    onFinished?(.success)
                }
                .buttonStyle(.borderedProminent)
                .disabled(!state.allResolved)
                .accessibilityHint(state.allResolved ? "Finish the merge" : "Resolve all conflicts first")
            }
        }
        .padding(16)
    }

    private func confirmAbortStep(hasResolvedConflicts: Bool) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Abort merge?")
                .font(.headline)
            Text(hasResolvedConflicts
                 ? "You have resolved conflicts. Aborting will discard those resolutions."
                 : "Aborting will cancel the in-progress merge.")
                .font(.callout)
                .foregroundStyle(.secondary)
            HStack {
                Spacer()
                Button("Keep merging") {
                    state = mergeWizardReduce(state, .cancelAbort)
                }
                Button("Abort", role: .destructive) {
                    task?.cancel()
                    Task {
                        try? await service.abortMerge(repositoryPath: repositoryPath)
                        await MainActor.run {
                            state = mergeWizardReduce(state, .aborted)
                            onCancel?()
                        }
                    }
                }
                .buttonStyle(.borderedProminent)
            }
        }
        .padding(16)
    }

    private func doneStep(result: MergeResult) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            switch result {
            case .success:
                SuccessfulMergeBannerView(ourBranch: ourBranch.name, theirBranch: state.theirBranchName)
            case .alreadyUpToDate:
                BranchUpToDateBannerView(ourBranch: ourBranch.name, theirBranch: state.theirBranchName)
            case .failed:
                ConflictsFoundBannerView(operationDescription: "merging") {}
            }
            HStack {
                Spacer()
                Button("Close") { onFinished?(result) }
                    .keyboardShortcut(.defaultAction)
                    .buttonStyle(.borderedProminent)
            }
        }
        .padding(16)
    }
}
