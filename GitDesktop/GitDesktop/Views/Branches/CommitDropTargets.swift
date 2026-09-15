import SwiftUI

// MARK: - CommitDropTargets
// Drop-target UI for Task 6 commit drag-and-drop. Ports the drop side of
// `history/commit-list-item.tsx` (commit → squash), `branches/*` rows
// (branch → cherry-pick), `lib/list/list-item-insertion-overlay.tsx`
// (insertion point → reorder), the `CommitDragElement` ghost
// (`ui/drag-elements/commit-drag-element.tsx`, minus GH fields per scope)
// and the keyboard-reorder hint (`history/commit-list.tsx`
// `reorderingMessage`).
//
// These modifiers/views bind to `DragAndDropManager` (`Services/DragDrop.swift`)
// and resolve drops through `routeCommitDrop`, so the host only handles the
// resulting `CommitDropAction` (usually by calling `Mock`/`LiveMultiCommitService`).

// MARK: Branch drop

/// Makes a branch row a cherry-pick drop target while a commit drag is
/// active. Highlights while targeted and reports the drop as shas.
public struct CommitBranchDropModifier: ViewModifier {
    var branchName: String
    var isDragActive: Bool
    var onDropCommits: (([String]) -> Void)?

    @State private var isTargeted = false

    public func body(content: Content) -> some View {
        content
            .background(isTargeted ? Color.accentColor.opacity(0.15) : Color.clear)
            .overlay(alignment: .trailing) {
                if isTargeted {
                    Image(systemName: "plus.circle.fill")
                        .foregroundStyle(.secondary)
                        .accessibilityHidden(true)
                }
            }
            .dropDestination(for: CommitDropPayload.self) { payloads, _ in
                guard isDragActive, let shas = payloads.first?.shas, !shas.isEmpty else { return false }
                onDropCommits?(shas)
                return true
            } isTargeted: { targeted in
                isTargeted = targeted && isDragActive
            }
            .accessibilityLabel(isTargeted ? "Copy to \(branchName)" : branchName)
    }
}

public extension View {
    /// Branch-row cherry-pick drop target (Task 5's `BranchRowView` wires its
    /// `onDropCommits` seam through this modifier).
    func commitBranchDropTarget(
        branchName: String,
        isDragActive: Bool,
        onDropCommits: (([String]) -> Void)? = nil
    ) -> some View {
        modifier(CommitBranchDropModifier(
            branchName: branchName,
            isDragActive: isDragActive,
            onDropCommits: onDropCommits))
    }
}

// MARK: Insertion point drop

/// Insertion-point drop row between commits. Reports the drop as
/// `.reorder(beforeSHA:)` via `routeCommitDrop`; shows "Move commits here"
/// while targeted (mirrors the insertion overlay tooltip copy).
public struct CommitInsertionPointView: View {
    var beforeSHA: String?
    var draggedSHAs: [String]
    var orderedSHAs: [String]
    var mergeCommitSHAs: Set<String>
    var onReorder: ((String?, [String]) -> Void)?

    @State private var isTargeted = false

    public init(
        beforeSHA: String?,
        draggedSHAs: [String] = [],
        orderedSHAs: [String] = [],
        mergeCommitSHAs: Set<String> = [],
        onReorder: ((String?, [String]) -> Void)? = nil
    ) {
        self.beforeSHA = beforeSHA
        self.draggedSHAs = draggedSHAs
        self.orderedSHAs = orderedSHAs
        self.mergeCommitSHAs = mergeCommitSHAs
        self.onReorder = onReorder
    }

    public var body: some View {
        Rectangle()
            .fill(isTargeted ? Color.accentColor : Color.clear)
            .frame(height: isTargeted ? 3 : 1)
            .frame(maxWidth: .infinity)
            .overlay(alignment: .center) {
                if isTargeted {
                    Text("Move \(draggedSHAs.count == 1 ? "commit" : "commits") here")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 6)
                        .background(.background)
                }
            }
            .dropDestination(for: CommitDropPayload.self) { payloads, _ in
                guard let shas = payloads.first?.shas, !shas.isEmpty else { return false }
                let action = routeCommitDrop(
                    draggedSHAs: shas,
                    target: .insertionPoint(beforeSHA: beforeSHA),
                    orderedSHAs: orderedSHAs,
                    mergeCommitSHAs: mergeCommitSHAs)
                if case .reorder(let before, let routed) = action {
                    onReorder?(before, routed)
                    return true
                }
                return false
            } isTargeted: { targeted in
                isTargeted = targeted
            }
            .accessibilityLabel(beforeSHA == nil ? "Move to end" : "Move before commit")
    }
}

// MARK: Drag ghost

/// Ghost shown under the cursor during a commit drag. Port of
/// `CommitDragElement` (count badge + lead commit; GH avatar data deleted per
/// scope). Shows the drop-target tooltip copy after a short hover, mirroring
/// the reference 1500ms tooltip timer on macOS.
public struct CommitDragGhostView: View {
    var count: Int
    var leadSummary: String
    var dropTarget: CommitDropTarget?

    @State private var showTooltip = false

    public init(count: Int, leadSummary: String, dropTarget: CommitDropTarget? = nil) {
        self.count = count
        self.leadSummary = leadSummary
        self.dropTarget = dropTarget
    }

    public var body: some View {
        HStack(spacing: 8) {
            ZStack {
                RoundedRectangle(cornerRadius: 6)
                    .fill(Color.accentColor)
                    .frame(width: 28, height: 28)
                Text("\(count)")
                    .font(.callout.bold())
                    .foregroundStyle(.white)
            }
            Text(leadSummary)
                .font(.callout)
                .lineLimit(1)
        }
        .padding(6)
        .background(.regularMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay(alignment: .bottom) {
            if showTooltip, let tooltip = tooltipText {
                Text(tooltip)
                    .font(.caption)
                    .padding(4)
                    .background(.regularMaterial)
                    .clipShape(RoundedRectangle(cornerRadius: 4))
                    .offset(y: 24)
            }
        }
        .onChange(of: dropTarget) { _, _ in
            showTooltip = false
            Task { @MainActor in
                try? await Task.sleep(for: .milliseconds(1500))
                showTooltip = true
            }
        }
        .accessibilityLabel("\(count) \(count == 1 ? "commit" : "commits")")
    }

    private var tooltipText: String? {
        switch dropTarget {
        case .branch(let name):
            return "Copy to \(name)"
        case .commit:
            return "Squash \(count + 1) commits"
        case .insertionPoint:
            return "Move \(count == 1 ? "commit" : "commits") here"
        case .none:
            return nil
        }
    }
}

// MARK: Keyboard reorder hint

/// Hint popover shown while keyboard-reorder mode is active
/// (`keyboardReorderHint` seam + `reorderingMessage` live region).
public struct KeyboardReorderHintView: View {
    var session: KeyboardReorderSession
    var onCancel: (() -> Void)?

    public init(session: KeyboardReorderSession, onCancel: (() -> Void)? = nil) {
        self.session = session
        self.onCancel = onCancel
    }

    public var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "arrow.up.arrow.down")
                .foregroundStyle(.secondary)
            Text(session.hintText)
                .font(.callout)
            Button("Cancel") { onCancel?() }
                .keyboardShortcut(.cancelAction)
        }
        .padding(8)
        .background(.regularMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .accessibilityElement(children: .combine)
        .accessibilityLabel(session.startMessage)
    }
}
