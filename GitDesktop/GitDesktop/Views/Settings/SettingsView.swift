import AppKit
import SwiftUI

// MARK: - Settings (Task 9)
// 5 tabs only: Git / Appearance (Tab Size) / Prompts / Advanced / Accessibility,
// plus the Apple Intelligence tab (new, replaces Copilot per Docs/08 §3).
// Title `Settings` (macOS). Vertical TabBar + footer Save/Cancel (cancel
// reverts tabSize). Lock-file recovery mirrors `ConfigLockFileExists`.
// Deleted tabs: Accounts, Integrations, Copilot, Notifications.

public enum SettingsTab: String, CaseIterable, Identifiable {
    case git = "Git"
    case appearance = "Appearance"
    case prompts = "Prompts"
    case advanced = "Advanced"
    case accessibility = "Accessibility"
    case appleIntelligence = "Apple Intelligence"

    public var id: String { rawValue }
}

/// Editable snapshot of every persisted setting. Pure value type so
/// Save/Cancel semantics are trivial + unit-testable.
public struct SettingsDraft: Sendable, Equatable {
    public var committerName: String
    public var committerEmail: String
    public var defaultBranch: String
    public var enableHookEnv: Bool
    public var cacheHookEnv: Bool
    public var hookShell: String
    public var tabSize: Int
    public var confirmRepoRemoval: Bool
    public var confirmDiscardChanges: Bool
    public var confirmDiscardPermanently: Bool
    public var confirmDiscardStash: Bool
    public var confirmCheckoutCommit: Bool
    public var confirmForcePush: Bool
    public var confirmUndoCommit: Bool
    public var confirmCommitFilteredChanges: Bool
    public var confirmCommitOverride: Bool
    public var confirmWorktreeRemoval: Bool
    public var showCommitLengthWarning: Bool
    public var uncommittedStrategy: UncommittedChangesStrategy
    public var optOutOfUsageTracking: Bool
    public var useExternalCredentialHelper: Bool
    public var repositoryIndicatorsEnabled: Bool
    public var underlineLinks: Bool
    public var showDiffCheckMarks: Bool
    public var appleIntelligenceEnabled: Bool

    public init(
        committerName: String = "",
        committerEmail: String = "",
        defaultBranch: String = "main",
        enableHookEnv: Bool = false,
        cacheHookEnv: Bool = true,
        hookShell: String = "/bin/zsh",
        tabSize: Int = 4,
        confirmRepoRemoval: Bool = true,
        confirmDiscardChanges: Bool = true,
        confirmDiscardPermanently: Bool = true,
        confirmDiscardStash: Bool = true,
        confirmCheckoutCommit: Bool = true,
        confirmForcePush: Bool = true,
        confirmUndoCommit: Bool = true,
        confirmCommitFilteredChanges: Bool = true,
        confirmCommitOverride: Bool = true,
        confirmWorktreeRemoval: Bool = true,
        showCommitLengthWarning: Bool = true,
        uncommittedStrategy: UncommittedChangesStrategy = .askForConfirmation,
        optOutOfUsageTracking: Bool = false,
        useExternalCredentialHelper: Bool = false,
        repositoryIndicatorsEnabled: Bool = true,
        underlineLinks: Bool = true,
        showDiffCheckMarks: Bool = true,
        appleIntelligenceEnabled: Bool = true
    ) {
        self.committerName = committerName
        self.committerEmail = committerEmail
        self.defaultBranch = defaultBranch
        self.enableHookEnv = enableHookEnv
        self.cacheHookEnv = cacheHookEnv
        self.hookShell = hookShell
        self.tabSize = tabSize
        self.confirmRepoRemoval = confirmRepoRemoval
        self.confirmDiscardChanges = confirmDiscardChanges
        self.confirmDiscardPermanently = confirmDiscardPermanently
        self.confirmDiscardStash = confirmDiscardStash
        self.confirmCheckoutCommit = confirmCheckoutCommit
        self.confirmForcePush = confirmForcePush
        self.confirmUndoCommit = confirmUndoCommit
        self.confirmCommitFilteredChanges = confirmCommitFilteredChanges
        self.confirmCommitOverride = confirmCommitOverride
        self.confirmWorktreeRemoval = confirmWorktreeRemoval
        self.showCommitLengthWarning = showCommitLengthWarning
        self.uncommittedStrategy = uncommittedStrategy
        self.optOutOfUsageTracking = optOutOfUsageTracking
        self.useExternalCredentialHelper = useExternalCredentialHelper
        self.repositoryIndicatorsEnabled = repositoryIndicatorsEnabled
        self.underlineLinks = underlineLinks
        self.showDiffCheckMarks = showDiffCheckMarks
        self.appleIntelligenceEnabled = appleIntelligenceEnabled
    }

    public static func load(in store: UserDefaults = .standard) -> SettingsDraft {
        SettingsDraft(
            committerName: store.string(forKey: Defaults.globalGitAuthorName) ?? "",
            committerEmail: store.string(forKey: Defaults.globalGitAuthorEmail) ?? "",
            defaultBranch: store.string(forKey: Defaults.defaultBranchName) ?? "main",
            enableHookEnv: Defaults.bool(Defaults.enableGitHookEnv, default: false, in: store),
            cacheHookEnv: Defaults.bool(Defaults.cacheGitHookEnv, default: true, in: store),
            hookShell: store.string(forKey: Defaults.gitHookEnvShell) ?? "/bin/zsh",
            tabSize: Defaults.integer(Defaults.tabSize, default: 4, in: store),
            confirmRepoRemoval: Defaults.bool(Defaults.confirmRepoRemoval, default: true, in: store),
            confirmDiscardChanges: Defaults.bool(Defaults.confirmDiscardChanges, default: true, in: store),
            confirmDiscardPermanently: Defaults.bool(Defaults.confirmDiscardChangesPermanently, default: true, in: store),
            confirmDiscardStash: Defaults.bool(Defaults.confirmDiscardStash, default: true, in: store),
            confirmCheckoutCommit: Defaults.bool(Defaults.confirmCheckoutCommit, default: true, in: store),
            confirmForcePush: Defaults.bool(Defaults.confirmForcePush, default: true, in: store),
            confirmUndoCommit: Defaults.bool(Defaults.confirmUndoCommit, default: true, in: store),
            confirmCommitFilteredChanges: Defaults.bool(Defaults.confirmCommitFilteredChanges, default: true, in: store),
            confirmCommitOverride: Defaults.bool(Defaults.confirmCommitMessageOverride, default: true, in: store),
            confirmWorktreeRemoval: Defaults.bool(Defaults.confirmWorktreeRemoval, default: true, in: store),
            showCommitLengthWarning: Defaults.bool(Defaults.showCommitLengthWarning, default: true, in: store),
            uncommittedStrategy: Defaults.strategy(in: store),
            optOutOfUsageTracking: Defaults.bool(Defaults.optOutOfUsageTracking, default: false, in: store),
            useExternalCredentialHelper: Defaults.bool(Defaults.useExternalCredentialHelper, default: false, in: store),
            repositoryIndicatorsEnabled: Defaults.bool(Defaults.repositoryIndicatorsEnabled, default: true, in: store),
            underlineLinks: Defaults.bool(Defaults.underlineLinks, default: true, in: store),
            showDiffCheckMarks: Defaults.bool(Defaults.showDiffCheckMarks, default: true, in: store),
            appleIntelligenceEnabled: Defaults.bool(Defaults.appleIntelligenceEnabled, default: true, in: store)
        )
    }

    public func save(in store: UserDefaults = .standard) {
        store.set(committerName, forKey: Defaults.globalGitAuthorName)
        store.set(committerEmail, forKey: Defaults.globalGitAuthorEmail)
        store.set(defaultBranch, forKey: Defaults.defaultBranchName)
        Defaults.setBool(enableHookEnv, Defaults.enableGitHookEnv, in: store)
        Defaults.setBool(cacheHookEnv, Defaults.cacheGitHookEnv, in: store)
        store.set(hookShell, forKey: Defaults.gitHookEnvShell)
        Defaults.setInteger(tabSize, Defaults.tabSize, in: store)
        Defaults.setBool(confirmRepoRemoval, Defaults.confirmRepoRemoval, in: store)
        Defaults.setBool(confirmDiscardChanges, Defaults.confirmDiscardChanges, in: store)
        Defaults.setBool(confirmDiscardPermanently, Defaults.confirmDiscardChangesPermanently, in: store)
        Defaults.setBool(confirmDiscardStash, Defaults.confirmDiscardStash, in: store)
        Defaults.setBool(confirmCheckoutCommit, Defaults.confirmCheckoutCommit, in: store)
        Defaults.setBool(confirmForcePush, Defaults.confirmForcePush, in: store)
        Defaults.setBool(confirmUndoCommit, Defaults.confirmUndoCommit, in: store)
        Defaults.setBool(confirmCommitFilteredChanges, Defaults.confirmCommitFilteredChanges, in: store)
        Defaults.setBool(confirmCommitOverride, Defaults.confirmCommitMessageOverride, in: store)
        Defaults.setBool(confirmWorktreeRemoval, Defaults.confirmWorktreeRemoval, in: store)
        Defaults.setBool(showCommitLengthWarning, Defaults.showCommitLengthWarning, in: store)
        Defaults.setStrategy(uncommittedStrategy, in: store)
        Defaults.setBool(optOutOfUsageTracking, Defaults.optOutOfUsageTracking, in: store)
        Defaults.setBool(useExternalCredentialHelper, Defaults.useExternalCredentialHelper, in: store)
        Defaults.setBool(repositoryIndicatorsEnabled, Defaults.repositoryIndicatorsEnabled, in: store)
        Defaults.setBool(underlineLinks, Defaults.underlineLinks, in: store)
        Defaults.setBool(showDiffCheckMarks, Defaults.showDiffCheckMarks, in: store)
        Defaults.setBool(appleIntelligenceEnabled, Defaults.appleIntelligenceEnabled, in: store)
    }

    /// Validation errors blocking Save (mirrors the reference Save guard).
    public func validationErrors() -> [String] {
        var errors: [String] = []
        if !gitAuthorNameIsValid(committerName) && !committerName.isEmpty {
            errors.append(invalidGitAuthorNameMessage)
        }
        if !isValidTabSize(tabSize) {
            errors.append("Tab size must be 2, 4, or 8.")
        }
        return errors
    }
}

public let macOSHookShells = ["/bin/zsh", "/bin/bash", "/bin/sh"]

public struct SettingsView: View {
    @ObservedObject var store: AppStore
    var popup: Popup
    var initialTab: SettingsTab
    @State private var draft: SettingsDraft
    @State private var selectedTab: SettingsTab
    @State private var isSaving = false
    @State private var saveError: String?
    @State private var lockFilePath: String?

    public init(store: AppStore, popup: Popup, initialTab: SettingsTab = .git) {
        self.store = store
        self.popup = popup
        self.initialTab = initialTab
        _draft = State(initialValue: SettingsDraft.load())
        _selectedTab = State(initialValue: initialTab)
    }

    public var body: some View {
        HStack(spacing: 0) {
            List(SettingsTab.allCases, selection: $selectedTab) { tab in
                Text(tab.rawValue).tag(tab)
            }
            .listStyle(.sidebar)
            .frame(width: 170)
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
            .frame(width: 460)
        }
        .frame(height: 440)
        .task { await refreshGitIdentity() }
    }

    @ViewBuilder
    private var tabContent: some View {
        switch selectedTab {
        case .git: GitSettingsTab(draft: $draft, onEditGitConfig: editGlobalGitConfig)
        case .appearance: AppearanceSettingsTab(draft: $draft)
        case .prompts: PromptsSettingsTab(draft: $draft)
        case .advanced: AdvancedSettingsTab(draft: $draft)
        case .accessibility: AccessibilitySettingsTab(draft: $draft)
        case .appleIntelligence: AppleIntelligenceSettingsTab(draft: $draft)
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
                .disabled(isSaving || !draft.validationErrors().isEmpty)
        }
        .padding(12)
    }

    private func refreshGitIdentity() async {
        // Prefill from global git config only (account prefill deleted).
        if draft.committerName.isEmpty {
            draft.committerName = (try? await RepositoryManagement.configValue(name: "user.name", repositoryPath: nil)) ?? ""
        }
        if draft.committerEmail.isEmpty {
            draft.committerEmail = (try? await RepositoryManagement.configValue(name: "user.email", repositoryPath: nil)) ?? ""
        }
        if let branch = try? await RepositoryManagement.configValue(name: "init.defaultBranch", repositoryPath: nil), !branch.isEmpty {
            draft.defaultBranch = branch
        }
    }

    private func editGlobalGitConfig() {
        // Port of `onEditGlobalGitConfig`: open ~/.gitconfig in the default app.
        let path = (NSHomeDirectory() as NSString).appendingPathComponent(".gitconfig")
        if FileManager.default.fileExists(atPath: path) {
            NSWorkspace.shared.open(URL(fileURLWithPath: path))
        }
    }

    private func save() {
        isSaving = true
        saveError = nil
        lockFilePath = nil
        let snapshot = draft
        Task {
            do {
                // Global identity + default branch go to real git config so
                // commits work; the rest persists to UserDefaults.
                if !snapshot.committerName.isEmpty {
                    try await RepositoryManagement.setConfigValue(snapshot.committerName, name: "user.name", repositoryPath: nil)
                }
                if !snapshot.committerEmail.isEmpty {
                    try await RepositoryManagement.setConfigValue(snapshot.committerEmail, name: "user.email", repositoryPath: nil)
                }
                if !snapshot.defaultBranch.isEmpty {
                    try await RepositoryManagement.setConfigValue(snapshot.defaultBranch, name: "init.defaultBranch", repositoryPath: nil)
                }
                snapshot.save()
                store.closePopup(popup)
            } catch let error as GitError {
                if error.kind == .configLockFileAlreadyExists || isConfigLockFileError(error.stderr) {
                    lockFilePath = parseConfigLockFilePath(error.stderr)
                        ?? configLockFilePath(from: error.stderr)
                        ?? "~/.gitconfig.lock"
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

// MARK: Tabs

struct GitSettingsTab: View {
    @Binding var draft: SettingsDraft
    var onEditGitConfig: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Git").font(.headline)
            LabeledField(label: "Name") {
                TextField("Your name", text: $draft.committerName).textFieldStyle(.roundedBorder)
            }
            LabeledField(label: "Email") {
                TextField("you@example.com", text: $draft.committerEmail).textFieldStyle(.roundedBorder)
            }
            LabeledField(label: "Default branch name") {
                TextField("main", text: $draft.defaultBranch).textFieldStyle(.roundedBorder)
            }
            Divider()
            Text("Hooks").font(.headline)
            Toggle("Load Git hook environment variables from shell", isOn: $draft.enableHookEnv)
            if draft.enableHookEnv {
                Picker("Shell", selection: $draft.hookShell) {
                    ForEach(macOSHookShells, id: \.self) { Text($0).tag($0) }
                }
                Toggle("Cache Git hook environment variables", isOn: $draft.cacheHookEnv)
            }
            Button("Edit global .gitconfig", action: onEditGitConfig).buttonStyle(.link)
        }
    }
}

struct AppearanceSettingsTab: View {
    @Binding var draft: SettingsDraft

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Appearance").font(.headline)
            Text("Tab Size").font(.subheadline)
            Picker("Tab size", selection: $draft.tabSize) {
                Text("2").tag(2)
                Text("4").tag(4)
                Text("8").tag(8)
            }
            .pickerStyle(.radioGroup)
            Text("Applies live to diffs. Theme, date, and number formats follow the system.")
                .font(.caption).foregroundStyle(.secondary)
        }
    }
}

struct PromptsSettingsTab: View {
    @Binding var draft: SettingsDraft

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Prompts").font(.headline)
            Toggle("Confirm repository removal", isOn: $draft.confirmRepoRemoval)
            Toggle("Confirm discard changes", isOn: $draft.confirmDiscardChanges)
            Toggle("Confirm discard changes permanently", isOn: $draft.confirmDiscardPermanently)
            Toggle("Confirm discard stash", isOn: $draft.confirmDiscardStash)
            Toggle("Confirm checkout commit (detached HEAD)", isOn: $draft.confirmCheckoutCommit)
            Toggle("Confirm force push", isOn: $draft.confirmForcePush)
            Toggle("Confirm undo commit", isOn: $draft.confirmUndoCommit)
            Toggle("Confirm commit with filtered files", isOn: $draft.confirmCommitFilteredChanges)
            Toggle("Confirm commit message override", isOn: $draft.confirmCommitOverride)
            Toggle("Confirm worktree removal", isOn: $draft.confirmWorktreeRemoval)
            Toggle("Show commit length warning", isOn: $draft.showCommitLengthWarning)
            Divider()
            Text("Uncommitted changes").font(.subheadline)
            Picker("", selection: $draft.uncommittedStrategy) {
                Text("Ask for confirmation").tag(UncommittedChangesStrategy.askForConfirmation)
                Text("Stash on current branch").tag(UncommittedChangesStrategy.stashOnCurrentBranch)
                Text("Move to new branch").tag(UncommittedChangesStrategy.moveToNewBranch)
            }
            .pickerStyle(.radioGroup)
        }
    }
}

struct AdvancedSettingsTab: View {
    @Binding var draft: SettingsDraft
    @State private var crashOptIn = isCrashReportingOptedIn()

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Advanced").font(.headline)
            Toggle("Opt out of usage tracking", isOn: $draft.optOutOfUsageTracking)
            Toggle("Use external credential helper", isOn: $draft.useExternalCredentialHelper)
            Toggle("Show repository indicators", isOn: $draft.repositoryIndicatorsEnabled)
            Divider()
            CrashConsentView(isOptedIn: $crashOptIn, pendingCount: 0)
                .onChange(of: crashOptIn) { _, new in
                    setCrashReportingOptedIn(new)
                }
            Text("Windows OpenSSH options are not shown on macOS.")
                .font(.caption).foregroundStyle(.secondary)
        }
    }
}

struct AccessibilitySettingsTab: View {
    @Binding var draft: SettingsDraft

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Accessibility").font(.headline)
            Toggle("Underline links", isOn: $draft.underlineLinks)
            Toggle("Show diff check marks", isOn: $draft.showDiffCheckMarks)
        }
    }
}

struct AppleIntelligenceSettingsTab: View {
    @Binding var draft: SettingsDraft

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Apple Intelligence").font(.headline)
            Text(availabilityText).font(.callout).foregroundStyle(.secondary)
            Toggle("Enable Apple Intelligence features", isOn: $draft.appleIntelligenceEnabled)
            Text("Runs on-device with Apple Intelligence. Diff content never leaves this Mac.")
                .font(.caption).foregroundStyle(.secondary)
        }
    }

    private var availabilityText: String {
        let gate = appleIntelligenceAvailability(
            enabledInSettings: draft.appleIntelligenceEnabled,
            osSupportsModel: true,
            modelStatus: nil)
        // `osSupportsModel` is re-checked at generation time via
        // `AppleIntelligenceService` (#available macOS 26 + model gate);
        // Settings reports the toggle state here so the copy stays truthful
        // on all macOS versions.
        if !draft.appleIntelligenceEnabled {
            return "Status: Disabled — \(AIAvailability.disabledInSettings.statusText)"
        }
        return "Status: \(gate.isAvailable ? "Enabled" : "Enabled (\(AIAvailability.unsupportedOS.statusText))") — on-device model availability is checked at generation time."
    }
}

/// Lock-file recovery (port of `ConfigLockFileExists`).
struct ConfigLockFileRecoveryView: View {
    var lockFilePath: String
    var onResolved: () -> Void
    @State private var deleteError: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("The git config file is locked (\(lockFilePath)). If no git process is running, delete the lock file and save again.")
                .font(.caption).foregroundStyle(.orange)
            HStack {
                Button("Delete lock file") {
                    do {
                        let expanded = (lockFilePath as NSString).expandingTildeInPath
                        try FileManager.default.removeItem(atPath: expanded)
                        onResolved()
                    } catch {
                        deleteError = error.localizedDescription
                    }
                }
                .buttonStyle(.link)
                if let deleteError {
                    Text(deleteError).font(.caption).foregroundStyle(.red)
                }
            }
        }
        .padding(8)
        .background(Color.orange.opacity(0.1))
        .cornerRadius(6)
    }
}
