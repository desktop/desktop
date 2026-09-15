import SwiftUI

// MARK: - RepositorySettings (Task 9)
// Dialog + vertical tabs: Remote | Ignored Files | Git Config.
// Port of `ui/repository-settings/*` with the Fork tab deleted per scope.
// Footer Save/Cancel + lock-file error recovery.

public enum RepositorySettingsTab: String, CaseIterable, Identifiable {
    case remote = "Remote"
    case ignoredFiles = "Ignored Files"
    case gitConfig = "Git Config"

    public var id: String { rawValue }
}

public struct RepositorySettingsView: View {
    @ObservedObject var store: AppStore
    var popup: Popup
    var repositoryID: Int
    var initialTab: RepositorySettingsTab
    @State private var selectedTab: RepositorySettingsTab
    @State private var remoteURL: String = ""
    @State private var remoteName: String = "origin"
    @State private var ignoreText: String = ""
    @State private var ignoreLoaded = false
    @State private var useLocalConfig: Bool = true
    @State private var committerName: String = ""
    @State private var committerEmail: String = ""
    @State private var isSaving = false
    @State private var saveError: String?
    @State private var lockFilePath: String?

    private var repository: Repository? {
        store.repositories.first { $0.id == repositoryID }
    }

    public init(store: AppStore, popup: Popup, repositoryID: Int, initialTab: RepositorySettingsTab = .remote) {
        self.store = store
        self.popup = popup
        self.repositoryID = repositoryID
        self.initialTab = initialTab
        _selectedTab = State(initialValue: initialTab)
    }

    public var body: some View {
        HStack(spacing: 0) {
            List(RepositorySettingsTab.allCases, selection: $selectedTab) { tab in
                Text(tab.rawValue).tag(tab)
            }
            .listStyle(.sidebar)
            .frame(width: 150)
            Divider()
            VStack(spacing: 0) {
                ScrollView {
                    tabContent
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(16)
                }
                Divider()
                footer
            }
            .frame(width: 470)
        }
        .frame(height: 400)
        .task { await load() }
    }

    @ViewBuilder
    private var tabContent: some View {
        switch selectedTab {
        case .remote:
            VStack(alignment: .leading, spacing: 8) {
                Text("Remote").font(.headline)
                if remoteName.isEmpty {
                    // Port of `no-remote.tsx` empty state.
                    Text("No remote configured.").font(.callout).foregroundStyle(.secondary)
                    Text("Add a remote URL below to enable fetch, pull, and push.")
                        .font(.caption).foregroundStyle(.secondary)
                }
                LabeledField(label: "Primary remote repository (\(remoteName)) URL") {
                    TextField("https://example.com/org/repo.git", text: $remoteURL)
                        .textFieldStyle(.roundedBorder).disabled(isSaving)
                }
            }
        case .ignoredFiles:
            VStack(alignment: .leading, spacing: 8) {
                Text("Ignored Files").font(.headline)
                Text("Edit the repository's .gitignore. Patterns use CRLF-aware formatting on save.")
                    .font(.caption).foregroundStyle(.secondary)
                TextEditor(text: $ignoreText)
                    .font(.system(.body, design: .monospaced))
                    .frame(minHeight: 180)
                    .border(Color(nsColor: .separatorColor))
                    .disabled(isSaving || !ignoreLoaded)
                if !ignoreLoaded { ProgressView().controlSize(.small) }
            }
        case .gitConfig:
            VStack(alignment: .leading, spacing: 8) {
                Text("Git Config").font(.headline)
                Picker("Use", selection: $useLocalConfig) {
                    Text("Repository settings").tag(true)
                    Text("Global settings").tag(false)
                }
                .pickerStyle(.segmented)
                LabeledField(label: "Name") {
                    TextField("Your name", text: $committerName)
                        .textFieldStyle(.roundedBorder).disabled(isSaving)
                }
                LabeledField(label: "Email") {
                    TextField("you@example.com", text: $committerEmail)
                        .textFieldStyle(.roundedBorder).disabled(isSaving)
                }
                if !gitAuthorNameIsValid(committerName) && !committerName.isEmpty {
                    Text(invalidGitAuthorNameMessage).font(.caption).foregroundStyle(.red)
                }
            }
        }
        if let saveErrorMessage = saveError {
            Text(saveErrorMessage).font(.caption).foregroundStyle(.red)
        }
        if let lockPath = lockFilePath {
            ConfigLockFileRecoveryView(lockFilePath: lockPath) {
                lockFilePath = nil
                saveError = nil
            }
        }
    }

    private var footer: some View {
        HStack {
            Spacer()
            Button("Cancel") { store.closePopup(popup) }
                .keyboardShortcut(.cancelAction).disabled(isSaving)
            Button("Save") { save() }
                .keyboardShortcut(.defaultAction)
                .buttonStyle(.borderedProminent)
                .disabled(isSaving)
        }
        .padding(12)
    }

    private func load() async {
        guard let repository else { return }
        // Remote: first remote's URL (reference shows the primary remote).
        do {
            let service = LiveGitService(repositoryPath: repository.path)
            let remotes = try await service.remotes()
            if let first = remotes.first {
                remoteName = first.name
                remoteURL = first.url
            } else {
                remoteName = ""
                remoteURL = ""
            }
        } catch {
            remoteName = store.repositoryStates[repository.hash]?.remote?.name ?? ""
            remoteURL = store.repositoryStates[repository.hash]?.remote?.url ?? ""
        }
        // .gitignore.
        do {
            let service = LiveGitService(repositoryPath: repository.path)
            ignoreText = (try service.readGitIgnore()) ?? ""
        } catch {
            ignoreText = ""
        }
        ignoreLoaded = true
        // Git config: local first, fall back to global display.
        let localName = try? await RepositoryManagement.configValue(name: "user.name", repositoryPath: repository.path, onlyLocal: true)
        let globalName = try? await RepositoryManagement.configValue(name: "user.name", repositoryPath: repository.path)
        committerName = localName ?? globalName ?? ""
        let localEmail = try? await RepositoryManagement.configValue(name: "user.email", repositoryPath: repository.path, onlyLocal: true)
        let globalEmail = try? await RepositoryManagement.configValue(name: "user.email", repositoryPath: repository.path)
        committerEmail = localEmail ?? globalEmail ?? ""
        useLocalConfig = true
    }

    private func save() {
        guard let repository else {
            store.closePopup(popup)
            return
        }
        isSaving = true
        saveError = nil
        lockFilePath = nil
        Task {
            do {
                // Remote URL edit via `setRemoteURL` (reference `remote.tsx`).
                if !remoteName.isEmpty && !remoteURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    try await RepositoryManagement.setRemoteURL(
                        repositoryPath: repository.path, name: remoteName,
                        url: remoteURL.trimmingCharacters(in: .whitespacesAndNewlines))
                }
                // .gitignore (CRLF-aware formatting happens in GitIgnoreOperations).
                let service = LiveGitService(repositoryPath: repository.path)
                try await service.saveGitIgnore(text: ignoreText)
                // Git config: per-repo vs global (reference `git-config-user-form`).
                let targetPath: String? = useLocalConfig ? repository.path : nil
                if !committerName.isEmpty {
                    try await RepositoryManagement.setConfigValue(committerName, name: "user.name", repositoryPath: targetPath)
                }
                if !committerEmail.isEmpty {
                    try await RepositoryManagement.setConfigValue(committerEmail, name: "user.email", repositoryPath: targetPath)
                }
                store.closePopup(popup)
            } catch let error as GitError {
                if error.kind == .configLockFileAlreadyExists || isConfigLockFileError(error.stderr) {
                    lockFilePath = parseConfigLockFilePath(error.stderr)
                        ?? configLockFilePath(from: error.stderr)
                        ?? "config.lock"
                    saveError = "The git config file is locked."
                } else {
                    saveError = error.displayMessage
                }
                isSaving = false
            } catch {
                saveError = error.localizedDescription
                isSaving = false
            }
        }
    }
}
