import SwiftUI

// MARK: - GitIgnoreEditor
// Port of `electron/app/src/ui/repository-settings/git-ignore.tsx` (editor half).
// Reads/writes the root `.gitignore` via `GitIgnoreLiveOperations`; symlink
// roots are rejected with an inline error instead of writing.

public struct GitIgnoreEditor: View {
    public var repositoryPath: String
    public var gitService: (any GitService)?

    @State private var text: String = ""
    @State private var originalText: String = ""
    @State private var isLoading: Bool = true
    @State private var isSaving: Bool = false
    @State private var errorMessage: String?

    public init(repositoryPath: String, gitService: (any GitService)? = nil) {
        self.repositoryPath = repositoryPath
        self.gitService = gitService
    }

    private var isDirty: Bool { text != originalText }

    public var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(".gitignore")
                    .font(.headline)
                Spacer()
                if isSaving { ProgressView().controlSize(.small) }
                Button("Revert") {
                    text = originalText
                    errorMessage = nil
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .disabled(!isDirty || isSaving)
                Button("Save") { Task { await save() } }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.small)
                    .disabled(!isDirty || isSaving)
                    .keyboardShortcut(.defaultAction)
            }
            if isLoading {
                ProgressView("Loading .gitignore…")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                TextEditor(text: $text)
                    .font(.system(size: 12, design: .monospaced))
                    .frame(minHeight: 200)
                    .border(.quaternary)
                    .disabled(isSaving)
                    .accessibilityLabel("gitignore editor")
            }
            if let errorMessage {
                Text(errorMessage)
                    .font(.caption)
                    .foregroundStyle(.red)
            }
            Text("One pattern per line. Lines ending in `/` ignore folders; `!` negates a pattern.")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(12)
        .task { await load() }
    }

    private func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        if let gitService {
            do {
                let value = try gitService.readGitIgnore() ?? ""
                text = value
                originalText = value
            } catch {
                errorMessage = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
            }
        } else {
            do {
                let value = try GitIgnoreLiveOperations.readGitIgnore(repositoryPath: repositoryPath) ?? ""
                text = value
                originalText = value
            } catch GitIgnoreError.symbolicLinkNotAllowed {
                errorMessage = "Cannot use a symbolic link as the root .gitignore file."
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }

    private func save() async {
        isSaving = true
        errorMessage = nil
        defer { isSaving = false }
        do {
            if let gitService {
                try await gitService.saveGitIgnore(text: text)
                originalText = text
            } else {
                try await GitIgnoreLiveOperations.saveGitIgnore(repositoryPath: repositoryPath, text: text)
                originalText = text
            }
        } catch GitIgnoreError.symbolicLinkNotAllowed {
            errorMessage = "Cannot use a symbolic link as the root .gitignore file."
        } catch {
            if let gitError = error as? GitError {
                errorMessage = gitError.displayMessage
            } else {
                errorMessage = error.localizedDescription
            }
        }
    }
}

/// Amend notice shown in the commit box while amending.
/// Port of the amend-notice half of `05-changes-commit.md` / `app-store.ts`
/// `start/stopAmending`.
public struct AmendNotice: View {
    public var commit: Commit
    public var onStopAmending: () -> Void

    public init(commit: Commit, onStopAmending: @escaping () -> Void = {}) {
        self.commit = commit
        self.onStopAmending = onStopAmending
    }

    public var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "pencil.circle.fill")
                .foregroundStyle(Color.accentColor)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 1) {
                Text("Amending \(commit.shortSha)")
                    .font(.callout.weight(.semibold))
                Text(commit.summary)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            Spacer()
            Button("Stop Amending", action: onStopAmending)
                .buttonStyle(.link)
                .controlSize(.small)
        }
        .padding(8)
        .background(.quaternary, in: RoundedRectangle(cornerRadius: 8))
        .accessibilityLabel("Amending commit \(commit.shortSha)")
    }
}

#Preview {
    VStack(spacing: 12) {
        GitIgnoreEditor(repositoryPath: "/tmp/mock-repo")
    }
    .frame(width: 500, height: 400)
}
