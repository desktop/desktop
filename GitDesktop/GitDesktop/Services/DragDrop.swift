import Combine
import Foundation
import SwiftUI
import UniformTypeIdentifiers

// MARK: - DragDrop
// Port of `electron/app/src/models/drag-drop.ts` (`DragType`, `DragData`,
// `DropTargetType`, `DropTarget`) + `lib/drag-and-drop-manager.ts`
// (`DragAndDropManager`) + the drop-routing rules spread across
// `history/commit-list-item.tsx` (commit → squash), `branches/*` (branch →
// cherry-pick) and `lib/list/list-item-insertion-overlay.tsx` (insertion →
// reorder), plus the keyboard-reorder mode in `history/commit-list.tsx`.
//
// NOTE (Task 5 unification): Task 5's `CommitList.swift` defines
// `CommitDragPayload` with the identical wire shape (`shas: [String]`,
// `.text` codable representation). `CommitDropPayload` below is the Task 6
// twin so this task compiles standalone; unify them (typealias) when both
// land — same-app drags decode either representation.

/// The kinds of data draggable inside the app. Only commits exist
/// (`DragType.Commit` is the sole member in the reference).
public enum DragType: Sendable, Equatable {
    case commit
}

/// Transferable commit-drag payload. Port of `CommitDragData`.
public struct CommitDropPayload: Codable, Transferable, Sendable {
    public var shas: [String]

    public init(shas: [String]) {
        self.shas = shas
    }

    public static var transferRepresentation: some TransferRepresentation {
        CodableRepresentation(contentType: .text)
    }
}

/// Where a commit drag hovers. Port of `DropTarget` (PR target deleted per
/// scope; insertion point carries the resolved `beforeSHA` instead of the
/// row index path so routing stays UI-agnostic).
public enum CommitDropTarget: Sendable, Equatable {
    /// A branch row (`DropTargetType.Branch`) → cherry-pick.
    case branch(name: String)
    /// A commit row (`DropTargetType.Commit`) → squash onto that commit.
    case commit(sha: String)
    /// An insertion point (`DropTargetType.ListInsertionPoint`) → reorder
    /// before the commit at that point, or to the end when nil.
    case insertionPoint(beforeSHA: String?)
}

/// Why a commit drop was rejected.
public enum CommitDropInvalidReason: Sendable, Equatable {
    case noCommits
    case droppedOntoItself
    case mergeCommitInvolved(sha: String)
    case notContiguous

    public var message: String {
        switch self {
        case .noCommits:
            return "No commits are being dragged."
        case .droppedOntoItself:
            return "Cannot squash commits onto themselves."
        case .mergeCommitInvolved(let sha):
            return "Cannot rewrite merge commit \(shortenSHA(sha))."
        case .notContiguous:
            return "Only contiguous commits can be reordered together."
        }
    }
}

/// The operation a commit drop resolves to.
public enum CommitDropAction: Sendable, Equatable {
    case cherryPick(branchName: String, shas: [String])
    case squash(ontoSHA: String, shas: [String])
    case reorder(beforeSHA: String?, shas: [String])
    case invalid(reason: CommitDropInvalidReason)
}

/// Whether `shas` form one contiguous run inside `orderedSHAs` (newest-first,
/// as displayed). Same semantics as Task 5's `isContiguousSelection`; kept
/// under a Task 6 name so both tasks merge without duplicate symbols.
public func areCommitsContiguous(draggedSHAs: [String], orderedSHAs: [String]) -> Bool {
    guard !draggedSHAs.isEmpty else { return true }
    let selected = Set(draggedSHAs)
    guard selected.count == draggedSHAs.count else { return false }
    var indices: [Int] = []
    for sha in selected {
        guard let index = orderedSHAs.firstIndex(of: sha) else { return false }
        indices.append(index)
    }
    indices.sort()
    for offset in 1..<indices.count where indices[offset] != indices[offset - 1] + 1 {
        return false
    }
    return true
}

/// Routes a commit drop to its operation. Mirrors the reference:
/// - branch → cherry-pick (`branches/*` drop handler);
/// - commit → squash onto it, unless the drag is only that commit itself
///   (`commit-list-item.tsx onMouseUp`);
/// - insertion point → reorder, guarded by contiguity + merge-commit checks
///   (PLAN §6; squash/reorder cannot rewrite merge commits).
public func routeCommitDrop(
    draggedSHAs: [String],
    target: CommitDropTarget,
    orderedSHAs: [String] = [],
    mergeCommitSHAs: Set<String> = []
) -> CommitDropAction {
    guard !draggedSHAs.isEmpty else { return .invalid(reason: .noCommits) }
    switch target {
    case .branch(let name):
        return .cherryPick(branchName: name, shas: draggedSHAs)
    case .commit(let sha):
        let toSquash = draggedSHAs.filter { $0 != sha }
        guard !toSquash.isEmpty else { return .invalid(reason: .droppedOntoItself) }
        for involved in toSquash + [sha] where mergeCommitSHAs.contains(involved) {
            return .invalid(reason: .mergeCommitInvolved(sha: involved))
        }
        return .squash(ontoSHA: sha, shas: toSquash)
    case .insertionPoint(let beforeSHA):
        for sha in draggedSHAs where mergeCommitSHAs.contains(sha) {
            return .invalid(reason: .mergeCommitInvolved(sha: sha))
        }
        if !orderedSHAs.isEmpty,
           !areCommitsContiguous(draggedSHAs: draggedSHAs, orderedSHAs: orderedSHAs) {
            return .invalid(reason: .notContiguous)
        }
        return .reorder(beforeSHA: beforeSHA, shas: draggedSHAs)
    }
}

// MARK: Drag-and-drop manager

/// App-wide commit-drag state. Port of `DragAndDropManager` (the reference
/// uses event-kit outside React state for performance; here an
/// `ObservableObject` notifies only the drop-target views that subscribe).
@MainActor
public final class DragAndDropManager: ObservableObject {
    @Published public private(set) var draggedSHAs: [String]?
    @Published public private(set) var dragPreviewSummary: String?
    @Published public private(set) var currentTarget: CommitDropTarget?
    @Published public private(set) var hoveredBranchName: String?

    /// Fired when a branch row stays hovered mid-drag (branch-dropdown
    /// auto-open in the reference). Debounced by `hoverOpenDelay`.
    public var onHoverBranchForAutoOpen: ((String) -> Void)?

    /// Hover time before the branch dropdown auto-opens. The reference opens
    /// the branch callout on hover during a commit drag; tab-switch uses
    /// `dragTabSwitchWaitTime` (500ms) — same value here.
    public var hoverOpenDelay: Duration = .milliseconds(500)

    private var hoverTask: Task<Void, Never>?

    public init() {}

    public var isDragActive: Bool { draggedSHAs != nil }
    public var draggedCount: Int { draggedSHAs?.count ?? 0 }

    public func beginDrag(shas: [String], leadSummary: String? = nil) {
        draggedSHAs = shas
        dragPreviewSummary = leadSummary
        currentTarget = nil
        hoveredBranchName = nil
    }

    public func updateTarget(_ target: CommitDropTarget?) {
        currentTarget = target
        if case .branch(let name) = target {
            hoverBranch(name)
        } else {
            hoveredBranchName = nil
            hoverTask?.cancel()
        }
    }

    public func endDrag() {
        draggedSHAs = nil
        dragPreviewSummary = nil
        currentTarget = nil
        hoveredBranchName = nil
        hoverTask?.cancel()
        hoverTask = nil
    }

    private func hoverBranch(_ name: String) {
        hoveredBranchName = name
        hoverTask?.cancel()
        hoverTask = Task { [weak self] in
            guard let self else { return }
            try? await Task.sleep(for: self.hoverOpenDelay)
            guard !Task.isCancelled, self.hoveredBranchName == name else { return }
            self.onHoverBranchForAutoOpen?(name)
        }
    }
}

// MARK: Keyboard reorder

/// Keyboard-driven reorder session. Port of `KeyboardInsertionData` +
/// the `reorderingMessage` live-region flow in `history/commit-list.tsx`:
/// the user picks commits (context menu `Reorder N Commits…`), arrows move
/// the insertion point, Enter confirms, Esc cancels.
public struct KeyboardReorderSession: Sendable, Equatable {
    public var shas: [String]
    /// Newest-first ordered SHAs of the list being reordered.
    public var orderedSHAs: [String]

    public init(shas: [String], orderedSHAs: [String]) {
        self.shas = shas
        self.orderedSHAs = orderedSHAs
    }

    /// Hint shown in the popover while the session is active.
    public var hintText: String {
        shas.count == 1
            ? "Select a new location for 1 commit. Press Enter to move it, Esc to cancel."
            : "Select a new location for \(shas.count) commits. Press Enter to move them, Esc to cancel."
    }

    /// Live-region message when the session starts.
    public var startMessage: String {
        shas.count == 1
            ? "Reordering 1 commit. Use arrow keys to choose a new location."
            : "Reordering \(shas.count) commits. Use arrow keys to choose a new location."
    }

    /// Resolves the Enter key at `insertionIndex` (row the insertion point
    /// sits above; `orderedSHAs.count` = end) to a reorder action.
    public func confirm(insertionIndex: Int, mergeCommitSHAs: Set<String> = []) -> CommitDropAction {
        let clamped = max(0, min(insertionIndex, orderedSHAs.count))
        let beforeSHA = clamped < orderedSHAs.count ? orderedSHAs[clamped] : nil
        return routeCommitDrop(
            draggedSHAs: shas,
            target: .insertionPoint(beforeSHA: beforeSHA),
            orderedSHAs: orderedSHAs,
            mergeCommitSHAs: mergeCommitSHAs)
    }
}
