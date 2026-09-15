import SwiftUI

// MARK: - Submodule + LFS views
// Port of the submodule/LFS slice of `electron/app/src/ui/diff/`
// (`submodule-diff`) + `lfs/*` prompts (see Docs/07 §5, Docs/09).
// Scope rules: `Show in Finder` only (no editor integration).

/// One submodule row: SHA + Open (reveal in Finder).
public struct SubmoduleRow: View {
    public var entry: SubmoduleEntry
    public var onOpen: ((SubmoduleEntry) -> Void)?

    public init(entry: SubmoduleEntry, onOpen: ((SubmoduleEntry) -> Void)? = nil) {
        self.entry = entry
        self.onOpen = onOpen
    }

    public var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "shippingbox")
                .foregroundStyle(.secondary)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 1) {
                Text(entry.path)
                    .font(.system(size: 12, weight: .medium))
                    .lineLimit(1)
                Text("\(shortenSHA(entry.sha)) · \(entry.describe)")
                    .font(.caption.monospaced())
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            Spacer()
            if onOpen != nil {
                Button("Show in Finder") { onOpen?(entry) }
                    .buttonStyle(.link)
                    .controlSize(.small)
            }
        }
        .padding(.vertical, 4)
        .accessibilityLabel("Submodule \(entry.path), \(shortenSHA(entry.sha))")
    }
}

/// Prompt to install LFS hooks (`initialize-lfs` popup content).
public struct InitializeLFSView: View {
    public var isInstalling: Bool
    public var onInstall: () -> Void
    public var onDismiss: () -> Void

    public init(isInstalling: Bool = false, onInstall: @escaping () -> Void = {}, onDismiss: @escaping () -> Void = {}) {
        self.isInstalling = isInstalling
        self.onInstall = onInstall
        self.onDismiss = onDismiss
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Initialize Git LFS?")
                .font(.headline)
            Text("This repository uses Git Large File Storage. Install the LFS hooks to push and pull large files correctly.")
                .font(.callout)
                .foregroundStyle(.secondary)
            HStack {
                Spacer()
                Button("Not Now", action: onDismiss)
                    .buttonStyle(.bordered)
                    .disabled(isInstalling)
                Button("Initialize LFS", action: onInstall)
                    .buttonStyle(.borderedProminent)
                    .disabled(isInstalling)
                    .keyboardShortcut(.defaultAction)
            }
            if isInstalling { ProgressView().controlSize(.small) }
        }
        .padding(16)
        .frame(minWidth: 380)
    }
}

/// Warning shown when `.gitattributes` disagrees with the LFS filter
/// (`lfs attribute-mismatch`).
public struct LFSAttributeMismatchView: View {
    public var onDismiss: () -> Void

    public init(onDismiss: @escaping () -> Void = {}) {
        self.onDismiss = onDismiss
    }

    public var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(.yellow)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 4) {
                Text("LFS attribute mismatch")
                    .font(.callout.weight(.semibold))
                Text("A `.gitattributes` filter disagrees with the LFS configuration. Check your `.gitattributes` before committing large files.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Button("Dismiss", action: onDismiss)
                .buttonStyle(.link)
                .controlSize(.small)
        }
        .padding(10)
        .background(.quaternary, in: RoundedRectangle(cornerRadius: 8))
        .accessibilityLabel("LFS attribute mismatch warning")
    }
}

#Preview {
    VStack(spacing: 12) {
        SubmoduleRow(entry: SubmoduleEntry(sha: "abc1234567890abcdef", path: "vendor/lib", describe: "v2.0.0"))
        InitializeLFSView()
        LFSAttributeMismatchView()
    }
    .padding()
}
