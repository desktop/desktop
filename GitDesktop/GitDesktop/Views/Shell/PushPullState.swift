import Foundation

// MARK: - PushPullState
// Pure derivation of the toolbar push/pull button state machine
// (Docs/04-shell-toolbar.md §2, port of `push-pull-button.tsx renderButton`).
// Task 7 wires real progress/network state; Task 6 wires force-push.

/// The action the push/pull button currently represents.
public enum PushPullAction: Sendable, Equatable {
    case publishRepository
    case publishBranch
    case fetch(remote: String)
    case pull(remote: String, rebase: Bool)
    case push(remote: String)
    case forcePush(remote: String)
    case progress(title: String)
    case detached(rebaseInProgress: Bool)
}

/// View-ready push/pull button state (no git calls, no formatters).
public struct PushPullViewState: Sendable, Equatable {
    public var action: PushPullAction
    public var aheadBehind: AheadBehind?
    public var numTagsToPush: Int
    public var lastFetched: Date?
    /// Whether the split caret (Fetch / Force push menu) is shown.
    public var showsSplitMenu: Bool
    public var showsForcePushMenuItem: Bool
    public var isEnabled: Bool

    public init(
        action: PushPullAction,
        aheadBehind: AheadBehind? = nil,
        numTagsToPush: Int = 0,
        lastFetched: Date? = nil,
        showsSplitMenu: Bool = false,
        showsForcePushMenuItem: Bool = false,
        isEnabled: Bool = true
    ) {
        self.action = action
        self.aheadBehind = aheadBehind
        self.numTagsToPush = numTagsToPush
        self.lastFetched = lastFetched
        self.showsSplitMenu = showsSplitMenu
        self.showsForcePushMenuItem = showsForcePushMenuItem
        self.isEnabled = isEnabled
    }
}

/// Derive the button state. Mirrors the `renderButton` branch order:
/// progress → no remote → unborn → detached → no upstream → up-to-date →
/// force-push recommended → behind → push.
public func derivePushPullState(
    tip: Tip,
    remoteName: String?,
    aheadBehind: AheadBehind?,
    numTagsToPush: Int = 0,
    progressTitle: String? = nil,
    rebaseInProgress: Bool = false,
    pullWithRebase: Bool = false,
    forcePushRecommended: Bool = false
) -> PushPullViewState {
    if let progressTitle {
        return PushPullViewState(action: .progress(title: progressTitle), isEnabled: false)
    }
    guard let remoteName else {
        // No remote: publishing targets the app, not GitHub (no GH per scope).
        return PushPullViewState(action: .publishRepository)
    }
    switch tip.kind {
    case .unborn:
        return PushPullViewState(action: .fetch(remote: remoteName))
    case .detached:
        return PushPullViewState(action: .detached(rebaseInProgress: rebaseInProgress), isEnabled: false)
    case .unknown:
        return PushPullViewState(action: .fetch(remote: remoteName), isEnabled: false)
    case .valid:
        break
    }
    guard let aheadBehind else {
        return PushPullViewState(
            action: .publishBranch, showsSplitMenu: true)
    }
    if aheadBehind.ahead == 0 && aheadBehind.behind == 0 && numTagsToPush == 0 {
        return PushPullViewState(action: .fetch(remote: remoteName))
    }
    if forcePushRecommended {
        return PushPullViewState(
            action: .forcePush(remote: remoteName),
            aheadBehind: aheadBehind, numTagsToPush: numTagsToPush,
            showsSplitMenu: true)
    }
    if aheadBehind.behind > 0 {
        return PushPullViewState(
            action: .pull(remote: remoteName, rebase: pullWithRebase),
            aheadBehind: aheadBehind, numTagsToPush: numTagsToPush,
            showsSplitMenu: true, showsForcePushMenuItem: true)
    }
    return PushPullViewState(
        action: .push(remote: remoteName),
        aheadBehind: aheadBehind, numTagsToPush: numTagsToPush,
        showsSplitMenu: true)
}

/// Compact ahead/behind badge text (`↑N ↓M`), nil when there is nothing to show.
/// Port of `renderAheadBehind` (compact numbers via system formatting).
public func aheadBehindBadge(ahead: Int, behind: Int, tagsToPush: Int = 0) -> String? {
    if ahead == 0 && behind == 0 && tagsToPush == 0 { return nil }
    var parts: [String] = []
    let up = ahead + tagsToPush
    if up > 0 { parts.append("↑\(up)") }
    if behind > 0 { parts.append("↓\(behind)") }
    return parts.joined(separator: " ")
}

// MARK: - Branch button

public struct BranchButtonState: Sendable, Equatable {
    public var title: String
    public var detail: String
    public var systemIcon: String
    public var isEnabled: Bool
}

/// Derive the branch dropdown button labels. `inProgressDescription` covers
/// the Task 5/7 states (`Rebasing`, `Checkout 42%`); nil → steady state.
public func deriveBranchButtonState(tip: Tip, inProgressDescription: String? = nil) -> BranchButtonState {
    switch tip {
    case .unknown:
        return BranchButtonState(
            title: "Unknown", detail: "No repository selected",
            systemIcon: "arrow.triangle.branch", isEnabled: false)
    case .unborn(let ref):
        return BranchButtonState(
            title: shortRefName(ref), detail: inProgressDescription ?? "Current Branch",
            systemIcon: "arrow.triangle.branch", isEnabled: true)
    case .detached(let sha):
        return BranchButtonState(
            title: "Detached HEAD", detail: inProgressDescription ?? "on \(shortenSHA(sha))",
            systemIcon: "circle.dotted", isEnabled: true)
    case .valid(let branch):
        return BranchButtonState(
            title: branch.name, detail: inProgressDescription ?? "Current Branch",
            systemIcon: "arrow.triangle.branch", isEnabled: true)
    }
}

private func shortRefName(_ ref: String) -> String {
    if ref.hasPrefix("refs/heads/") { return String(ref.dropFirst("refs/heads/".count)) }
    return ref
}
