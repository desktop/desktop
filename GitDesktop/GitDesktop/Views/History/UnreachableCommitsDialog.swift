import SwiftUI

// MARK: - UnreachableCommitsDialog
// Port of `history/unreachable-commits-dialog.tsx`: explains why a
// multi-selection diff omits commits that are not in the ancestry path of the
// most recent commit. Read-only commit list with Reachable/Unreachable tabs.

public struct UnreachableCommitsDialog: View {
    var selectedCommits: [Commit]
    var shasInDiff: Set<String>
    var localCommitSHAs: Set<String>
    @State private var selectedTab: UnreachableTab = .unreachable
    @State private var selectedSHAs: Set<String> = []
    var onDismiss: (() -> Void)?

    public enum UnreachableTab: String, CaseIterable {
        case unreachable = "Unreachable"
        case reachable = "Reachable"
    }

    public init(
        selectedCommits: [Commit],
        shasInDiff: Set<String>,
        localCommitSHAs: Set<String> = [],
        onDismiss: (() -> Void)? = nil
    ) {
        self.selectedCommits = selectedCommits
        self.shasInDiff = shasInDiff
        self.localCommitSHAs = localCommitSHAs
        self.onDismiss = onDismiss
    }

    private var reachable: [Commit] {
        selectedCommits.filter { shasInDiff.contains($0.sha) }
    }

    private var unreachable: [Commit] {
        selectedCommits.filter { !shasInDiff.contains($0.sha) }
    }

    private var visibleCommits: [Commit] {
        selectedTab == .reachable ? reachable : unreachable
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Unreachable commits")
                .font(.headline)
            Text(explanation)
                .font(.callout)
                .foregroundStyle(.secondary)
            Picker("Commits", selection: $selectedTab) {
                Text("Unreachable (\(unreachable.count))").tag(UnreachableTab.unreachable)
                Text("Reachable (\(reachable.count))").tag(UnreachableTab.reachable)
            }
            .pickerStyle(.segmented)
            CommitListView(
                commits: visibleCommits,
                selectedSHAs: $selectedSHAs,
                localCommitSHAs: localCommitSHAs
            )
            .frame(minHeight: 200)
            HStack {
                Spacer()
                Button("OK") { onDismiss?() }
                    .keyboardShortcut(.defaultAction)
                    .buttonStyle(.borderedProminent)
            }
        }
        .padding(16)
        .frame(minWidth: 480, minHeight: 380)
    }

    private var explanation: String {
        if selectedTab == .unreachable {
            return "You will not see changes from these commits because they are not in the ancestry path of the most recently selected commit."
        } else {
            return "You will see changes from these commits because they are in the ancestry path of the most recently selected commit."
        }
    }
}
