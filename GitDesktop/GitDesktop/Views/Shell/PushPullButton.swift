import SwiftUI

// MARK: - PushPullButton
// SwiftUI port of `electron/app/src/ui/toolbar/push-pull-button.tsx`
// (+ `push-pull-button-dropdown.tsx` + `revert-progress.tsx`).
//
// The state machine itself (`resolvePushPullState`) lives in
// `Git/Operations/Sync.swift` so it stays unit-testable without AppKit;
// this file only renders a `PushPullState` and forwards taps. Task 2's
// shell owns the live wiring (progress stream, last-fetched clock,
// force-push confirms); previews below show every state with mock data.

/// Toolbar push/pull/fetch button.
public struct PushPullButton: View {
    public var state: PushPullState
    public var onAction: (PushPullAction) -> Void
    public var onFetch: () -> Void
    public var onForcePush: () -> Void

    public init(
        state: PushPullState,
        onAction: @escaping (PushPullAction) -> Void = { _ in },
        onFetch: @escaping () -> Void = {},
        onForcePush: @escaping () -> Void = {}
    ) {
        self.state = state
        self.onAction = onAction
        self.onFetch = onFetch
        self.onForcePush = onForcePush
    }

    public var body: some View {
        HStack(spacing: 0) {
            mainButton
            if !state.dropdownItems.isEmpty {
                Menu {
                    ForEach(state.dropdownItems, id: \.self) { item in
                        switch item {
                        case .fetch:
                            Button("Fetch") { onFetch() }
                        case .forcePush:
                            Button("Force push…") { onForcePush() }
                        }
                    }
                } label: {
                    Image(systemName: "chevron.down")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 6)
                        .frame(maxHeight: .infinity)
                        .contentShape(Rectangle())
                }
                .menuStyle(.borderlessButton)
                .disabled(!state.enabled)
                .help("Push, pull, fetch options")
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(state.title), \(state.description)")
        .accessibilityAddTraits(state.enabled ? [] : .isStaticText)
    }

    @ViewBuilder
    private var mainButton: some View {
        Button {
            onAction(state.action)
        } label: {
            HStack(spacing: 6) {
                Image(systemName: iconName)
                    .imageScale(.medium)
                VStack(alignment: .leading, spacing: 0) {
                    Text(state.title)
                        .font(.system(size: 12, weight: .semibold))
                    Text(state.description)
                        .font(.system(size: 10))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                if let badge = state.badge {
                    AheadBehindBadgeView(badge: badge)
                }
                if state.showsProgress {
                    ProgressView(value: state.progressValue ?? 0)
                        .progressViewStyle(.linear)
                        .frame(width: 60)
                }
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
        }
        .buttonStyle(.plain)
        .disabled(!state.enabled)
        .help("\(state.title) — \(state.description)")
    }

    private var iconName: String {
        switch state.action {
        case .publishRepository, .publishBranch:
            return "square.and.arrow.up"
        case .fetch:
            return "arrow.triangle.2.circlepath"
        case .pull:
            return "arrow.down"
        case .push:
            return "arrow.up"
        case .forcePush:
            return "arrow.up.arrow.down"
        case .progress:
            return "arrow.triangle.2.circlepath"
        case .detached:
            return "minus.circle"
        }
    }
}

/// Compact `↑N ↓M` badge (port of `renderAheadBehind`).
public struct AheadBehindBadgeView: View {
    public var badge: AheadBehindBadge

    public init(badge: AheadBehindBadge) {
        self.badge = badge
    }

    public var body: some View {
        HStack(spacing: 4) {
            if let up = badge.up {
                Label(up, systemImage: "arrow.up")
            }
            if let down = badge.down {
                Label(down, systemImage: "arrow.down")
            }
        }
        .font(.system(size: 10, weight: .semibold))
        .foregroundStyle(.secondary)
        .labelStyle(.titleAndIcon)
        .accessibilityElement(children: .combine)
    }
}

/// Toolbar revert progress button (port of `revert-progress.tsx`).
public struct RevertProgressView: View {
    public var progress: AppProgress

    public init(progress: AppProgress) {
        self.progress = progress
    }

    public var body: some View {
        HStack(spacing: 6) {
            Image(systemName: "arrow.triangle.2.circlepath")
            VStack(alignment: .leading, spacing: 0) {
                Text("Reverting…")
                    .font(.system(size: 12, weight: .semibold))
                Text(progress.progressDescription ?? progress.title ?? "Hang on…")
                    .font(.system(size: 10))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            ProgressView(value: progress.value)
                .progressViewStyle(.linear)
                .frame(width: 60)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Reverting, \(progress.progressDescription ?? "in progress")")
        .help("Reverting…")
    }
}

// MARK: - Previews (mock states; Task 2 wires live data)

#Preview("Push") {
    PushPullButton(state: resolvePushPullState(
        tip: .valid(branch: Branch(
            name: "main", upstream: "origin/main",
            tip: BranchTip(sha: "abc1234"), type: .local, ref: "refs/heads/main")),
        remoteName: "origin",
        aheadBehind: AheadBehind(ahead: 2, behind: 0),
        numTagsToPush: 0,
        progress: nil,
        forcePushState: .notAvailable,
        pullWithRebase: false,
        rebaseInProgress: false,
        lastFetched: nil))
    .padding()
}

#Preview("Pull with badge") {
    PushPullButton(state: resolvePushPullState(
        tip: .valid(branch: Branch(
            name: "main", upstream: "origin/main",
            tip: BranchTip(sha: "abc1234"), type: .local, ref: "refs/heads/main")),
        remoteName: "origin",
        aheadBehind: AheadBehind(ahead: 1, behind: 3),
        numTagsToPush: 0,
        progress: nil,
        forcePushState: .available,
        pullWithRebase: false,
        rebaseInProgress: false,
        lastFetched: Date()))
    .padding()
}

#Preview("Fetch + progress + revert") {
    VStack(spacing: 12) {
        PushPullButton(state: resolvePushPullState(
            tip: .valid(branch: Branch(
                name: "main", upstream: "origin/main",
                tip: BranchTip(sha: "abc1234"), type: .local, ref: "refs/heads/main")),
            remoteName: "origin",
            aheadBehind: AheadBehind(ahead: 0, behind: 0),
            numTagsToPush: 0,
            progress: nil,
            forcePushState: .notAvailable,
            pullWithRebase: false,
            rebaseInProgress: false,
            lastFetched: nil))
        PushPullButton(state: resolvePushPullState(
            tip: .valid(branch: Branch(
                name: "main", upstream: "origin/main",
                tip: BranchTip(sha: "abc1234"), type: .local, ref: "refs/heads/main")),
            remoteName: "origin",
            aheadBehind: AheadBehind(ahead: 2, behind: 0),
            numTagsToPush: 0,
            progress: .fetch(
                remote: "origin",
                payload: ProgressPayload(value: 0.42, title: "Fetching origin", description: "Receiving objects: 42% (21/50)")),
            forcePushState: .notAvailable,
            pullWithRebase: false,
            rebaseInProgress: false,
            lastFetched: nil))
        RevertProgressView(progress: .revert(ProgressPayload(value: 0, title: "Reverting…")))
    }
    .padding()
}
