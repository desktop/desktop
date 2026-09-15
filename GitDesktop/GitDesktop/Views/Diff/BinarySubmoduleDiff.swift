import AppKit
import SwiftUI

// MARK: - BinaryFileView
// Placeholder for binary files. Port of
// `electron/app/src/ui/diff/binary-file.tsx`. The reference opens the file
// in its default app; per scope (only Show in Finder via `NSWorkspace`) the
// action reveals the file in Finder instead.

public struct BinaryFileView: View {
    let path: String
    let repositoryPath: String
    var onReveal: ((String) -> Void)?

    public init(
        path: String,
        repositoryPath: String,
        onReveal: ((String) -> Void)? = nil
    ) {
        self.path = path
        self.repositoryPath = repositoryPath
        self.onReveal = onReveal
    }

    public var body: some View {
        VStack(spacing: 8) {
            Text("This binary file has changed.")
                .font(.system(size: 13))
            Button("Show in Finder") {
                reveal()
            }
            .buttonStyle(.link)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding()
    }

    private var fullPath: String {
        (repositoryPath as NSString).appendingPathComponent(path)
    }

    private func reveal() {
        if let onReveal {
            onReveal(fullPath)
            return
        }
        let url = URL(fileURLWithPath: fullPath)
        if FileManager.default.fileExists(atPath: fullPath) {
            NSWorkspace.shared.activateFileViewerSelecting([url])
        } else {
            NSWorkspace.shared.activateFileViewerSelecting([url.deletingLastPathComponent()])
        }
    }
}

// MARK: - SubmoduleDiffView
// Submodule change summary. Port of
// `electron/app/src/ui/diff/submodule-diff.tsx`, minus GitHub links
// (scope: no GitHub integration — the submodule URL renders as plain text).

public struct SubmoduleDiffView: View {
    let diff: SubmoduleDiffData
    let readOnly: Bool
    var onOpenSubmodule: ((String) -> Void)?

    public init(
        diff: SubmoduleDiffData,
        readOnly: Bool = false,
        onOpenSubmodule: ((String) -> Void)? = nil
    ) {
        self.diff = diff
        self.readOnly = readOnly
        self.onOpenSubmodule = onOpenSubmodule
    }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text("Submodule changes")
                    .font(.headline)
                if let url = diff.url {
                    submoduleItem(icon: "info.circle.fill", tint: .blue) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("This is a submodule.")
                            Text(url)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .textSelection(.enabled)
                        }
                    }
                }
                commitChangeItem
                if diff.status.untrackedChanges || diff.status.modifiedChanges {
                    submoduleItem(icon: "doc.fill", tint: .secondary) {
                        Text("This submodule has \(changeDescription) changes. Those changes must be committed inside of the submodule before they can be part of the parent repository.")
                    }
                }
                if diff.url != nil {
                    Button("Open Repository") {
                        onOpenSubmodule?(diff.fullPath)
                    }
                    .help("Open this submodule as a normal repository to manage and commit any changes in it.")
                }
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    @ViewBuilder
    private var commitChangeItem: some View {
        let verb = readOnly ? "was" : "has been"
        let suffix = readOnly
            ? ""
            : " This change can be committed to the parent repository."
        if let old = diff.oldSHA, let new = diff.newSHA {
            submoduleItem(icon: "arrow.triangle.branch", tint: .orange) {
                shaText(
                    prefix: "This submodule changed its commit from ",
                    middle: " to ",
                    suffix: ".\(suffix)",
                    firstSHA: old, firstLabel: "previous",
                    secondSHA: new, secondLabel: "new")
            }
        } else if let new = diff.newSHA {
            submoduleItem(icon: "plus.circle.fill", tint: .green) {
                shaText(
                    prefix: "This submodule \(verb) added pointing at commit ",
                    middle: "", suffix: ".\(suffix)",
                    firstSHA: new, firstLabel: nil,
                    secondSHA: nil, secondLabel: nil)
            }
        } else if let old = diff.oldSHA {
            submoduleItem(icon: "minus.circle.fill", tint: .red) {
                shaText(
                    prefix: "This submodule \(verb) removed while it was pointing at commit ",
                    middle: "", suffix: ".\(suffix)",
                    firstSHA: old, firstLabel: nil,
                    secondSHA: nil, secondLabel: nil)
            }
        }
    }

    private var changeDescription: String {
        if diff.status.untrackedChanges && diff.status.modifiedChanges {
            return "modified and untracked"
        }
        return diff.status.untrackedChanges ? "untracked" : "modified"
    }

    private func submoduleItem<Content: View>(
        icon: String, tint: Color, @ViewBuilder content: () -> Content
    ) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: icon)
                .foregroundStyle(tint)
            content()
                .font(.system(size: 12))
        }
    }

    private func shaText(
        prefix: String, middle: String, suffix: String,
        firstSHA: String, firstLabel: String?,
        secondSHA: String?, secondLabel: String?
    ) -> some View {
        // Compose with copy buttons; Text concatenation with buttons needs
        // a flow layout, so use an HStack with wrapping via flexible layout.
        VStack(alignment: .leading, spacing: 4) {
            Text(prefix).font(.system(size: 12)) + Text(shortSHA(firstSHA))
                .font(.system(size: 12, design: .monospaced)) + Text(middle + (secondSHA.map { shortSHA($0) } ?? "") + suffix)
                .font(.system(size: 12))
            HStack(spacing: 8) {
                copySHAButton(sha: firstSHA, label: firstLabel)
                if let secondSHA {
                    copySHAButton(sha: secondSHA, label: secondLabel)
                }
            }
        }
    }

    private func copySHAButton(sha: String, label: String?) -> some View {
        Button("Copy\(label.map { " \($0)" } ?? "") SHA") {
            NSPasteboard.general.clearContents()
            NSPasteboard.general.setString(sha, forType: .string)
        }
        .buttonStyle(.link)
        .font(.caption)
        .help("Copy the full\(label.map { " \($0)" } ?? "") SHA")
    }

    private func shortSHA(_ sha: String) -> String {
        String(sha.prefix(7))
    }
}

#Preview {
    VStack {
        SubmoduleDiffView(diff: SubmoduleDiffData(
            fullPath: "/tmp/repo/vendor/lib",
            path: "vendor/lib",
            url: "https://example.com/vendor/lib.git",
            status: SubmoduleStatus(commitChanged: true, modifiedChanges: true, untrackedChanges: false),
            oldSHA: "abc1234567890",
            newSHA: "def9876543210"))
        Divider()
        BinaryFileView(path: "assets/logo.png", repositoryPath: "/tmp/repo")
            .frame(height: 120)
    }
    .frame(width: 440, height: 420)
}
