import SwiftUI
import AppKit

// MARK: - Welcome (Task 9)
// Cold-start flow: Start (Clone/Create/Add) → ConfigureGit (name/email + Finish).
// Port of `ui/welcome/*` with sign-in steps deleted per scope (no GitHub).
// Gated by `has-shown-welcome-flow` (see `RepositoryPersistence`).

public enum WelcomeStep: String, Sendable, Equatable {
    case start
    case configureGit
}

public struct WelcomeView: View {
    @ObservedObject var store: AppStore
    var onComplete: () -> Void = {}
    @State private var step: WelcomeStep = .start
    @State private var userName: String = ""
    @State private var userEmail: String = ""
    @State private var isSaving = false
    @State private var errorMessage: String?

    public init(store: AppStore, onComplete: @escaping () -> Void = {}) {
        self.store = store
        self.onComplete = onComplete
    }

    public var body: some View {
        HStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 16) {
                Spacer()
                switch step {
                case .start:
                    WelcomeStartStep(
                        onClone: { store.showPopup(.cloneRepository(initialURL: nil)) },
                        onCreate: { store.showPopup(.createRepository(path: nil)) },
                        onAdd: { store.showPopup(.addRepository(path: nil)) },
                        onContinue: { step = .configureGit })
                case .configureGit:
                    WelcomeConfigureGitStep(
                        userName: $userName, userEmail: $userEmail,
                        isSaving: isSaving, errorMessage: errorMessage,
                        onBack: { step = .start },
                        onFinish: finish)
                }
                Spacer()
            }
            .padding(32)
            .frame(maxWidth: 480)
            WelcomeIllustration()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .frame(minWidth: 760, minHeight: 460)
        .background(DialogHost(store: store))
        .task { await loadGlobalIdentity() }
    }

    private func loadGlobalIdentity() async {
        userName = (try? await RepositoryManagement.configValue(name: "user.name", repositoryPath: nil)) ?? ""
        userEmail = (try? await RepositoryManagement.configValue(name: "user.email", repositoryPath: nil)) ?? ""
    }

    private func finish() {
        let name = userName.trimmingCharacters(in: .whitespacesAndNewlines)
        let email = userEmail.trimmingCharacters(in: .whitespacesAndNewlines)
        guard gitAuthorNameIsValid(name), !email.isEmpty, email.contains("@") else {
            errorMessage = "Enter a valid name and email. The name cannot contain < or >."
            return
        }
        isSaving = true
        errorMessage = nil
        Task {
            do {
                try await RepositoryManagement.setConfigValue(name, name: "user.name", repositoryPath: nil)
                try await RepositoryManagement.setConfigValue(email, name: "user.email", repositoryPath: nil)
                RepositoryPersistence.setHasShownWelcomeFlow(true)
                onComplete()
            } catch {
                errorMessage = (error as? GitError)?.displayMessage ?? error.localizedDescription
                isSaving = false
            }
        }
    }
}

struct WelcomeStartStep: View {
    var onClone: () -> Void
    var onCreate: () -> Void
    var onAdd: () -> Void
    var onContinue: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Welcome to GitDesktop")
                .font(.system(size: 28, weight: .light))
            Text("A native macOS Git client. Clone, create, or add a repository to get started — no sign-in required.")
                .font(.callout).foregroundStyle(.secondary)
            VStack(alignment: .leading, spacing: 8) {
                WelcomeActionButton(title: "Clone a repository from the Internet…", systemIcon: "arrow.down.circle", action: onClone)
                WelcomeActionButton(title: "Create a new repository on your local drive…", systemIcon: "plus.circle", action: onCreate)
                WelcomeActionButton(title: "Add an existing repository from your local drive…", systemIcon: "folder", action: onAdd)
            }
            .padding(.top, 8)
            HStack {
                Spacer()
                Button("Continue") { onContinue() }
                    .buttonStyle(.borderedProminent)
                    .keyboardShortcut(.defaultAction)
            }
            .padding(.top, 8)
        }
    }
}

struct WelcomeActionButton: View {
    var title: String
    var systemIcon: String
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack {
                Image(systemName: systemIcon).font(.system(size: 16))
                Text(title).font(.system(size: 13))
                Spacer()
            }
            .padding(.vertical, 6)
        }
        .buttonStyle(.bordered)
    }
}

struct WelcomeConfigureGitStep: View {
    @Binding var userName: String
    @Binding var userEmail: String
    var isSaving: Bool
    var errorMessage: String?
    var onBack: () -> Void
    var onFinish: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Configure Git").font(.system(size: 24, weight: .light))
            Text("This is used to identify the commits you create. Anyone will be able to see this information if you publish commits.")
                .font(.callout).foregroundStyle(.secondary)
            LabeledField(label: "Name") {
                TextField("Your name", text: $userName)
                    .textFieldStyle(.roundedBorder).disabled(isSaving)
            }
            LabeledField(label: "Email") {
                TextField("you@example.com", text: $userEmail)
                    .textFieldStyle(.roundedBorder).disabled(isSaving)
            }
            if !gitAuthorNameIsValid(userName) && !userName.isEmpty {
                Text(invalidGitAuthorNameMessage).font(.caption).foregroundStyle(.red)
            }
            if let errorMessage {
                Text(errorMessage).font(.caption).foregroundStyle(.red)
            }
            HStack {
                Button("Back") { onBack() }.disabled(isSaving)
                Spacer()
                Button("Finish") { onFinish() }
                    .buttonStyle(.borderedProminent)
                    .keyboardShortcut(.defaultAction)
                    .disabled(isSaving)
            }
            if isSaving { ProgressView().controlSize(.small) }
        }
    }
}

struct WelcomeIllustration: View {
    var body: some View {
        ZStack {
            Color(nsColor: .controlBackgroundColor)
            VStack(spacing: 12) {
                Image(systemName: "folder.fill.badge.plus")
                    .font(.system(size: 64, weight: .light))
                    .foregroundStyle(.secondary)
                Text("Your repositories live here.")
                    .font(.callout).foregroundStyle(.secondary)
            }
        }
    }
}

// MARK: - Tutorial

/// Right-rail tutorial checklist (port of `ui/tutorial/tutorial-panel.tsx`
/// with PickEditor deleted and OpenPullRequest replaced by PushBranch-is-done).
public struct TutorialPanel: View {
    @Binding var step: TutorialStep
    var onExit: () -> Void
    var onSkip: () -> Void

    public init(step: Binding<TutorialStep>, onExit: @escaping () -> Void = {}, onSkip: @escaping () -> Void = {}) {
        _step = step
        self.onExit = onExit
        self.onSkip = onSkip
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Tutorial").font(.headline)
                Spacer()
                Button("Skip") { onSkip() }.buttonStyle(.link)
                Button("Exit") { onExit() }.buttonStyle(.link)
            }
            ForEach(orderedTutorialDisplaySteps, id: \.self) { item in
                TutorialRow(
                    step: item,
                    state: rowState(for: item),
                    isCurrent: item == step)
            }
            .font(.callout)
        }
        .padding(12)
        .background(Color(nsColor: .controlBackgroundColor))
        .cornerRadius(8)
    }

    /// Display order: CreateBranch → EditFile → MakeCommit → PushBranch → AllDone.
    var orderedTutorialDisplaySteps: [TutorialStep] {
        [.createBranch, .editFile, .makeCommit, .pushBranch, .allDone]
    }

    private func rowState(for item: TutorialStep) -> TutorialRowState {
        let order = orderedTutorialDisplaySteps
        guard let current = order.firstIndex(of: step),
              let target = order.firstIndex(of: item)
        else { return .upcoming }
        if target < current { return .done }
        if target == current { return .current }
        return .upcoming
    }
}

enum TutorialRowState { case done, current, upcoming }

struct TutorialRow: View {
    var step: TutorialStep
    var state: TutorialRowState
    var isCurrent: Bool

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: state == .done ? "checkmark.circle.fill" : (state == .current ? "circle.circle" : "circle"))
                .foregroundStyle(state == .done ? .green : .secondary)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).fontWeight(isCurrent ? .semibold : .regular)
                Text(hint).font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            if step == .makeCommit && isCurrent {
                Image(systemName: "arrow.right")
                    .foregroundStyle(Color.accentColor)
                    .help("Commit in the commit box to continue the tutorial")
            }
        }
        .accessibilityLabel("\(title): \(state == .done ? "done" : state == .current ? "current" : "upcoming")")
    }

    private var title: String {
        switch step {
        case .createBranch: return "Create a branch"
        case .editFile: return "Edit a file"
        case .makeCommit: return "Make a commit"
        case .pushBranch: return "Push the branch"
        case .allDone: return "Done"
        default: return step.rawValue
        }
    }

    private var hint: String {
        switch step {
        case .createBranch: return "Branches keep work separate (⌘⇧N)"
        case .editFile: return "Change any file in Finder"
        case .makeCommit: return "Write a summary and press ⌘↵"
        case .pushBranch: return "Share it with Push (⌘P)"
        case .allDone: return "Tutorial complete"
        default: return ""
        }
    }
}

/// Placeholder shown instead of the diff when the tutorial repo has no changes.
public struct TutorialWelcomeView: View {
    var onCreateBranch: () -> Void

    public init(onCreateBranch: @escaping () -> Void = {}) {
        self.onCreateBranch = onCreateBranch
    }

    public var body: some View {
        VStack(spacing: 8) {
            Text("Welcome to the tutorial").font(.headline)
            Text("Create a branch to get started, then edit a file and make a commit.")
                .font(.callout).foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            Button("Create a branch…", action: onCreateBranch)
                .buttonStyle(.borderedProminent)
        }
        .padding()
    }
}

public struct TutorialDoneView: View {
    var onExit: () -> Void

    public init(onExit: @escaping () -> Void = {}) {
        self.onExit = onExit
    }

    public var body: some View {
        VStack(spacing: 8) {
            Image(systemName: "checkmark.circle.fill").font(.system(size: 32)).foregroundStyle(.green)
            Text("Tutorial complete").font(.headline)
            Text("You created a branch, made a commit, and pushed it. Nice work.")
                .font(.callout).foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            Button("Exit tutorial", action: onExit).buttonStyle(.borderedProminent)
        }
        .padding()
    }
}

/// Create-tutorial-repository dialog (port of the reference dialog of the
/// same name: name + path picker, creates + selects the repo).
public struct CreateTutorialRepositoryDialog: View {
    @ObservedObject var store: AppStore
    var popup: Popup
    @State private var name: String = TutorialRepository.defaultName
    @State private var parentPath: String = NSHomeDirectory()
    @State private var errorMessage: String?
    @State private var isWorking = false

    public init(store: AppStore, popup: Popup) {
        self.store = store
        self.popup = popup
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Create Tutorial Repository").font(.headline)
            Text("The tutorial uses a dedicated repository so you can experiment safely.")
                .font(.callout).foregroundStyle(.secondary)
            LabeledField(label: "Name") {
                TextField("Tutorial", text: $name)
                    .textFieldStyle(.roundedBorder).disabled(isWorking)
            }
            LabeledField(label: "Location") {
                HStack {
                    TextField("Parent directory", text: $parentPath)
                        .textFieldStyle(.roundedBorder).disabled(isWorking)
                    Button("Browse…") {
                        let panel = NSOpenPanel()
                        panel.canChooseFiles = false
                        panel.canChooseDirectories = true
                        panel.canCreateDirectories = true
                        if panel.runModal() == .OK, let url = panel.url {
                            parentPath = url.path
                        }
                    }.disabled(isWorking)
                }
            }
            if let errorMessage {
                Text(errorMessage).font(.caption).foregroundStyle(.red)
            }
            HStack {
                Spacer()
                Button("Cancel") { store.closePopup(popup) }
                    .keyboardShortcut(.cancelAction).disabled(isWorking)
                Button("Create") { create() }
                    .keyboardShortcut(.defaultAction)
                    .buttonStyle(.borderedProminent)
                    .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isWorking)
            }
            if isWorking { ProgressView().controlSize(.small) }
        }
        .padding(20).frame(width: 440)
    }

    private func create() {
        isWorking = true
        errorMessage = nil
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        Task { @MainActor in
            do {
                let path = try await TutorialRepository.create(at: parentPath, name: sanitizedRepositoryName(trimmedName))
                store.addRepositories([Repository(path: path, id: store.nextRepositoryID(), isTutorialRepository: true)])
                store.persistRepositories()
                store.closePopup(popup)
            } catch {
                errorMessage = (error as? GitError)?.displayMessage ?? error.localizedDescription
                isWorking = false
            }
        }
    }
}

public struct ConfirmExitTutorialDialog: View {
    @ObservedObject var store: AppStore
    var popup: Popup
    var onExit: () -> Void

    public init(store: AppStore, popup: Popup, onExit: @escaping () -> Void = {}) {
        self.store = store
        self.popup = popup
        self.onExit = onExit
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Exit Tutorial?").font(.headline)
            Text("You can restart the tutorial later by creating a new tutorial repository.")
                .font(.callout)
            HStack {
                Spacer()
                Button("Cancel") { store.closePopup(popup) }
                    .keyboardShortcut(.cancelAction)
                Button("Exit Tutorial", role: .destructive) {
                    onExit()
                    store.closePopup(popup)
                }
                .keyboardShortcut(.defaultAction)
            }
        }
        .padding(20).frame(width: 400)
    }
}
