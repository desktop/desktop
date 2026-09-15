import SwiftUI

// MARK: - BannerHost
// Top banner stack (Docs/04-shell-toolbar.md §6, `banners/*`). Each banner:
// icon + text + action link + dismiss X. Success/info banners auto-dismiss
// after 5s; conflict/OS banners persist. First action is focusable for
// keyboard users; the stack is a polite live region.

struct BannerHost: View {
    @ObservedObject var store: AppStore
    /// Task 10 (Sparkle) owns update state; Task 2 renders the row.
    @Binding var updateAvailableVersion: String?

    var body: some View {
        VStack(spacing: 0) {
            if let banner = store.currentBanner {
                BannerRow(banner: banner, store: store)
            }
            if let version = updateAvailableVersion {
                UpdateAvailableRow(version: version) {
                    updateAvailableVersion = nil
                } whatsNew: {
                    // TODO(Task 10): open ReleaseNotes popup via Sparkle state.
                    store.showPopup(.releaseNotes)
                }
            }
        }
    }
}

struct BannerRow: View {
    var banner: Banner
    @ObservedObject var store: AppStore

    private var content: BannerContent { describeBanner(banner) }

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: iconName)
                .foregroundStyle(iconColor)
                .font(.system(size: 13, weight: .semibold))
            Text(content.message)
                .font(.system(size: 12))
                .lineLimit(2)
            Spacer(minLength: 8)
            if content.action != .none, let actionTitle = content.actionTitle {
                Button(actionTitle, action: performAction)
                    .buttonStyle(.link)
                    .font(.system(size: 12, weight: .semibold))
            }
            Button {
                store.clearBanner()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(.secondary)
            }
            .buttonStyle(.plain)
            .help("Dismiss")
            .accessibilityLabel("Dismiss banner")
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity)
        .background(tintColor.opacity(0.18))
        .overlay(alignment: .bottom) {
            Rectangle().fill(tintColor.opacity(0.4)).frame(height: 1)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(content.message)
        .accessibilityAnnouncement(content.message)
        .id(bannerIdentity)
        .task(id: bannerIdentity) {
            guard content.autoDismisses else { return }
            try? await Task.sleep(nanoseconds: 5_000_000_000)
            if !Task.isCancelled, store.currentBanner == banner {
                store.clearBanner()
            }
        }
    }

    /// Stable identity for the auto-dismiss task (Banner is value-typed).
    private var bannerIdentity: String {
        "\(banner.type.rawValue)-\(content.message)"
    }

    private var iconName: String {
        switch content.tint {
        case .success: return "checkmark.circle.fill"
        case .conflict: return "exclamationmark.triangle.fill"
        case .info: return "info.circle.fill"
        case .warning: return "exclamationmark.triangle.fill"
        }
    }

    private var iconColor: Color {
        switch content.tint {
        case .success: return .green
        case .conflict: return .orange
        case .info: return .blue
        case .warning: return .yellow
        }
    }

    private var tintColor: Color {
        switch content.tint {
        case .success: return .green
        case .conflict: return .orange
        case .info: return .blue
        case .warning: return .yellow
        }
    }

    private func performAction() {
        switch content.action {
        case .none:
            break
        case .undo:
            // TODO(Tasks 5–6): perform the real undo (undoSha/branchName),
            // then show the *Undone banner.
            store.clearBanner()
        case .reopenConflictDialog:
            if case .mergeConflictsFound(_, let popup) = banner {
                store.showPopup(popup)
            }
            // TODO(Tasks 5–6): reopen the rebase/cherry-pick conflict flow.
            // The banner stays up until conflicts resolve.
            if case .mergeConflictsFound = banner {
                store.clearBanner()
            }
        }
    }
}

// MARK: - UpdateBannerHost (Task 10: Sparkle states)

/// Drives update UI from `UpdateService` state: available → banner with
/// Download/What's New; downloading → progress + Cancel; installing →
/// progress (quit blocked); installedPendingRestart → relaunch note.
/// The legacy `BannerHost(updateAvailableVersion:)` row stays for compat and
/// renders only when the updater has no banner of its own.
struct UpdateBannerHost: View {
    @ObservedObject var updater: UpdateService
    @ObservedObject var store: AppStore

    var body: some View {
        Group {
            switch updater.state {
            case .upToDate, .checking:
                EmptyView()
            case .available(let version):
                UpdateAvailableRow(
                    version: version,
                    onDismiss: { updater.setStateForTesting(.upToDate) },
                    whatsNew: { store.showPopup(.releaseNotes) },
                    download: { updater.downloadAvailableUpdate() })
            case .downloading(let version, let progress):
                UpdateProgressRow(
                    title: "Downloading GitDesktop \(version)…",
                    progress: progress,
                    cancelTitle: "Cancel",
                    onCancel: { updater.cancelDownload() })
            case .installing(let version):
                UpdateProgressRow(
                    title: "Installing GitDesktop \(version)…",
                    progress: nil,
                    cancelTitle: nil,
                    onCancel: {})
            case .installedPendingRestart(let version):
                UpdateAvailableRow(
                    version: version,
                    onDismiss: { updater.setStateForTesting(.upToDate) },
                    whatsNew: { store.showPopup(.releaseNotes) },
                    download: nil)
            }
        }
    }
}

/// Progress row for downloading/installing (quit blocked while visible).
struct UpdateProgressRow: View {
    var title: String
    var progress: Double?
    var cancelTitle: String?
    var onCancel: () -> Void

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "arrow.down.circle.fill")
                .foregroundStyle(.blue)
                .font(.system(size: 13, weight: .semibold))
            Text(title)
                .font(.system(size: 12))
            if let progress {
                ProgressView(value: progress)
                    .progressViewStyle(.linear)
                    .frame(width: 160)
                Text("\(Int((progress * 100).rounded()))%")
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
            } else {
                ProgressView()
                    .controlSize(.small)
            }
            Spacer(minLength: 8)
            if let cancelTitle {
                Button(cancelTitle, action: onCancel)
                    .buttonStyle(.link)
                    .font(.system(size: 12, weight: .semibold))
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity)
        .background(Color.blue.opacity(0.12))
        .overlay(alignment: .bottom) {
            Rectangle().fill(Color.blue.opacity(0.35)).frame(height: 1)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(title)
        .accessibilityAnnouncement(title)
    }
}

struct UpdateAvailableRow: View {
    var version: String
    var onDismiss: () -> Void
    var whatsNew: () -> Void
    var download: (() -> Void)? = nil

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "arrow.down.circle.fill")
                .foregroundStyle(.blue)
                .font(.system(size: 13, weight: .semibold))
            Text("An updated version of GitDesktop (\(version)) is available and will be installed at the next launch. See ")
                .font(.system(size: 12))
            + Text("what's new")
                .font(.system(size: 12))
                .foregroundColor(.blue)
            Spacer(minLength: 8)
            if let download {
                Button("Download", action: download)
                    .buttonStyle(.link)
                    .font(.system(size: 12, weight: .semibold))
            }
            Button("What's New", action: whatsNew)
                .buttonStyle(.link)
                .font(.system(size: 12, weight: .semibold))
            Button {
                onDismiss()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(.secondary)
            }
            .buttonStyle(.plain)
            .help("Dismiss")
            .accessibilityLabel("Dismiss update banner")
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity)
        .background(Color.blue.opacity(0.12))
        .overlay(alignment: .bottom) {
            Rectangle().fill(Color.blue.opacity(0.35)).frame(height: 1)
        }
        .accessibilityElement(children: .combine)
        .accessibilityAnnouncement("An updated version of GitDesktop (\(version)) is available.")
    }
}

#Preview {
    PreviewBannerHost()
}

private struct PreviewBannerHost: View {
    @State var store: AppStore = makePreviewStore()
    @State var updateVersion: String? = "3.4.6"

    var body: some View {
        BannerHost(store: store, updateAvailableVersion: $updateVersion)
            .frame(width: 800)
            .onAppear {
                store.setBanner(.successfulMerge(ourBranch: "main", theirBranch: "feature/dark-toolbar"))
            }
    }
}
