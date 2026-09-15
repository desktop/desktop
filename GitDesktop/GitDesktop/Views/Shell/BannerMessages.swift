import Foundation

// MARK: - BannerMessages
// Pure banner copy + behavior mapping (Docs/04-shell-toolbar.md §6).
// `Banner` stays value-typed (Task 1): actions become `BannerAction` tokens
// that `BannerHost` maps back to `AppStore` calls. UpdateAvailable is a
// Task 10 (Sparkle) concern and is rendered separately, not via `Banner`.

public enum BannerTint: String, Sendable, Equatable {
    case success
    case conflict
    case info
    case warning
}

public enum BannerAction: Sendable, Equatable {
    case none
    /// Undo the operation (Tasks 5–6 wire the real undo; Task 2 dismisses).
    case undo
    /// Reopen the stored conflict dialog (merge carries its `Popup`).
    case reopenConflictDialog
}

public struct BannerContent: Sendable, Equatable {
    public var tint: BannerTint
    public var message: String
    public var action: BannerAction
    public var actionTitle: String?
    /// Success/info banners auto-dismiss after 5s; conflicts persist.
    public var autoDismisses: Bool

    public init(tint: BannerTint, message: String, action: BannerAction = .none, actionTitle: String? = nil, autoDismisses: Bool) {
        self.tint = tint
        self.message = message
        self.action = action
        self.actionTitle = actionTitle
        self.autoDismisses = autoDismisses
    }
}

public func describeBanner(_ banner: Banner) -> BannerContent {
    switch banner {
    case .successfulMerge(let ourBranch, let theirBranch):
        let message = theirBranch.map {
            "Successfully merged \($0) into \(ourBranch)"
        } ?? "Successfully merged into \(ourBranch)"
        return BannerContent(tint: .success, message: message, autoDismisses: true)

    case .mergeConflictsFound(let ourBranch, _):
        return BannerContent(
            tint: .conflict,
            message: "Merge conflicts found in \(ourBranch). Resolve the conflicts to continue.",
            action: .reopenConflictDialog, actionTitle: "Resolve conflicts",
            autoDismisses: false)

    case .successfulRebase(let targetBranch, let baseBranch):
        let message = baseBranch.map {
            "Successfully rebased \(targetBranch) on \($0)"
        } ?? "Successfully rebased \(targetBranch)"
        return BannerContent(
            tint: .success, message: message,
            action: .undo, actionTitle: "Undo", autoDismisses: true)

    case .rebaseConflictsFound(let targetBranch, _):
        return BannerContent(
            tint: .conflict,
            message: "Rebase conflicts found in \(targetBranch). Resolve the conflicts to continue.",
            action: .reopenConflictDialog, actionTitle: "Resolve conflicts",
            autoDismisses: false)

    case .branchAlreadyUpToDate(let ourBranch, let theirBranch):
        let message = theirBranch.map {
            "Your branch is up to date with '\($0)'."
        } ?? "Your branch \(ourBranch) is up to date."
        return BannerContent(tint: .info, message: message, autoDismisses: true)

    case .successfulCherryPick(let targetBranchName, let count, _):
        return BannerContent(
            tint: .success,
            message: "Successfully cherry-picked \(commitCount(count)) onto \(targetBranchName).",
            action: .undo, actionTitle: "Undo", autoDismisses: true)

    case .cherryPickConflictsFound(let targetBranchName, _):
        return BannerContent(
            tint: .conflict,
            message: "Cherry-pick conflicts found on \(targetBranchName). Resolve the conflicts to continue.",
            action: .reopenConflictDialog, actionTitle: "Resolve conflicts",
            autoDismisses: false)

    case .cherryPickUndone(let targetBranchName, let count):
        return BannerContent(
            tint: .success,
            message: "Undid cherry-pick of \(commitCount(count)) onto \(targetBranchName).",
            autoDismisses: true)

    case .successfulSquash(let count, _):
        return BannerContent(
            tint: .success,
            message: "Successfully squashed \(commitCount(count)).",
            action: .undo, actionTitle: "Undo", autoDismisses: true)

    case .squashUndone(let commitsCount):
        return BannerContent(
            tint: .success,
            message: "Undid squash of \(commitCount(commitsCount)).",
            autoDismisses: true)

    case .successfulReorder(let count, _):
        return BannerContent(
            tint: .success,
            message: "Successfully reordered \(commitCount(count)).",
            action: .undo, actionTitle: "Undo", autoDismisses: true)

    case .reorderUndone(let commitsCount):
        return BannerContent(
            tint: .success,
            message: "Undid reorder of \(commitCount(commitsCount)).",
            autoDismisses: true)

    case .conflictsFound(let operationDescription, _):
        return BannerContent(
            tint: .conflict,
            message: "Conflicts found during \(operationDescription). Resolve the conflicts to continue.",
            action: .reopenConflictDialog, actionTitle: "Resolve conflicts",
            autoDismisses: false)

    case .osVersionNoLongerSupported:
        return BannerContent(
            tint: .warning,
            message: "This version of macOS is no longer supported. Upgrade macOS to keep receiving updates.",
            autoDismisses: false)
    }
}

private func commitCount(_ count: Int) -> String {
    count == 1 ? "1 commit" : "\(count) commits"
}
