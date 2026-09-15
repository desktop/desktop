import SwiftUI
import AppKit
import UniformTypeIdentifiers

// MARK: - RepositoryDialogs (Task 9)
// Add existing / Create new / Clone generic dialogs.
// Ports of `ui/add-repository/*` + `ui/clone-repository/clone-generic-repository.tsx`
// (GitHub tab + account picker deleted per scope).

// MARK: Add existing

public struct AddExistingRepositoryDialog: View {
    @ObservedObject var store: AppStore
    var popup: Popup
    @State private var path: String
    @State private var errorMessage: String?
    @State private var isWorking = false

    public init(store: AppStore, popup: Popup, initialPath: String?) {
        self.store = store
        self.popup = popup
        _path = State(initialValue: initialPath ?? "")
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Add Existing Repository").font(.headline)
            Text("Add a repository that's already on your local drive.")
                .font(.callout).foregroundStyle(.secondary)
            HStack {
                TextField("Repository path", text: $path)
                    .textFieldStyle(.roundedBorder)
                    .disabled(isWorking)
                Button("Browse…") { browse() }.disabled(isWorking)
            }
            if let errorMessage {
                Text(errorMessage).font(.caption).foregroundStyle(.red)
            }
            HStack {
                Spacer()
                Button("Cancel") { store.closePopup(popup) }
                    .keyboardShortcut(.cancelAction).disabled(isWorking)
                Button("Add") { add() }
                    .keyboardShortcut(.defaultAction)
                    .buttonStyle(.borderedProminent)
                    .disabled(path.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isWorking)
            }
            if isWorking { ProgressView().controlSize(.small) }
        }
        .padding(20).frame(width: 460)
    }

    private func browse() {
        let panel = NSOpenPanel()
        panel.canChooseFiles = false
        panel.canChooseDirectories = true
        panel.canCreateDirectories = false
        if panel.runModal() == .OK, let url = panel.url {
            path = url.path
            errorMessage = nil
        }
    }

    private func add() {
        let target = path.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !target.isEmpty else { return }
        isWorking = true
        errorMessage = nil
        Task { @MainActor in
            do {
                _ = try await store.addLocalRepository(at: target)
                store.closePopup(popup)
            } catch let error as GitError {
                errorMessage = error.displayMessage
                isWorking = false
            } catch {
                errorMessage = error.localizedDescription
                isWorking = false
            }
        }
    }
}

// MARK: Create new

public struct CreateRepositoryDialog: View {
    @ObservedObject var store: AppStore
    var popup: Popup
    @State private var name: String = ""
    @State private var parentPath: String
    @State private var gitIgnoreName: String = "None"
    @State private var licenseName: String = "None"
    @State private var createReadme = true
    @State private var errorMessage: String?
    @State private var isWorking = false

    public init(store: AppStore, popup: Popup, initialPath: String?) {
        self.store = store
        self.popup = popup
        _parentPath = State(initialValue: initialPath ?? NSHomeDirectory())
    }

    private var validationNote: String? {
        validateCreateRepository(name: name, parentPath: parentPath)
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Create a New Repository").font(.headline)
            LabeledField(label: "Name") {
                TextField("Repository name", text: $name)
                    .textFieldStyle(.roundedBorder).disabled(isWorking)
            }
            LabeledField(label: "Local path") {
                HStack {
                    TextField("Parent directory", text: $parentPath)
                        .textFieldStyle(.roundedBorder).disabled(isWorking)
                    Button("Browse…") { browse() }.disabled(isWorking)
                }
            }
            Text("Will create \((parentPath as NSString).appendingPathComponent(sanitizedRepositoryName(name.isEmpty ? "name" : name)))")
                .font(.caption).foregroundStyle(.secondary)
            HStack {
                LabeledField(label: "Git ignore") {
                    Picker("", selection: $gitIgnoreName) {
                        ForEach(bundledGitIgnoreNames, id: \.self) { Text($0).tag($0) }
                    }.frame(width: 150)
                }
                LabeledField(label: "License") {
                    Picker("", selection: $licenseName) {
                        ForEach(bundledLicenses.map(\.name), id: \.self) { Text($0).tag($0) }
                    }.frame(width: 170)
                }
            }
            Toggle("Initialize with a README", isOn: $createReadme).disabled(isWorking)
            if let note = validationNote, !name.isEmpty {
                Text(note).font(.caption).foregroundStyle(.orange)
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
        .padding(20).frame(width: 500)
    }

    private func browse() {
        let panel = NSOpenPanel()
        panel.canChooseFiles = false
        panel.canChooseDirectories = true
        panel.canCreateDirectories = true
        if panel.runModal() == .OK, let url = panel.url {
            parentPath = url.path
        }
    }

    private func create() {
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let sanitized = sanitizedRepositoryName(trimmedName)
        let repoPath = (parentPath as NSString).appendingPathComponent(sanitized)
        isWorking = true
        errorMessage = nil
        Task { @MainActor in
            do {
                if FileManager.default.fileExists(atPath: repoPath) {
                    throw GitError(kind: nil, args: ["init"], stdout: "", stderr: "A file or directory already exists at \(repoPath).", exitCode: 128)
                }
                try await RepositoryManagement.initRepository(at: repoPath)
                try? RepositoryManagement.writeGitIgnore(at: repoPath, name: gitIgnoreName)
                if let template = bundledLicenses.first(where: { $0.name == licenseName }) {
                    let authorName = (try? await RepositoryManagement.configValue(name: "user.name", repositoryPath: nil)) ?? ""
                    let authorEmail = (try? await RepositoryManagement.configValue(name: "user.email", repositoryPath: nil)) ?? ""
                    try? RepositoryManagement.writeLicense(
                        at: repoPath, template: template, project: sanitized,
                        fullname: authorName, email: authorEmail, description: "")
                }
                if createReadme {
                    try RepositoryManagement.writeDefaultReadme(at: repoPath, name: sanitized)
                }
                let repo = Repository(path: repoPath, id: store.nextRepositoryID())
                store.addRepositories([repo])
                store.persistRepositories()
                store.closePopup(popup)
            } catch let error as GitError {
                errorMessage = error.displayMessage
                isWorking = false
            } catch {
                errorMessage = error.localizedDescription
                isWorking = false
            }
        }
    }
}

// MARK: Clone generic

public struct CloneRepositoryDialog: View {
    @ObservedObject var store: AppStore
    var popup: Popup
    @State private var url: String
    @State private var localPath: String
    @State private var branch: String = ""
    @State private var errorMessage: String?
    @State private var isWorking = false
    @State private var progressValue: Double = 0
    @State private var progressTitle: String = "Cloning…"
    @State private var cloneTask: Task<Void, Never>?

    public init(store: AppStore, popup: Popup, initialURL: String?) {
        self.store = store
        self.popup = popup
        _url = State(initialValue: initialURL ?? "")
        _localPath = State(initialValue: (NSHomeDirectory() as NSString).appendingPathComponent("Code"))
    }

    private var validationError: String? {
        validateCloneRequest(url: url, destinationPath: resolvedDestination)
    }

    private var resolvedDestination: String {
        // Mirror the reference: destination = localPath/<repo-name-from-url>.
        let base = (url as NSString).lastPathComponent
        var name = base
        if name.hasSuffix(".git") { name = String(name.dropLast(4)) }
        if name.isEmpty || name == "/" { return localPath }
        return (localPath as NSString).appendingPathComponent(name)
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Clone a Repository").font(.headline)
            Text("Enter the URL of a repository to clone. Any remote works — not just GitHub.")
                .font(.callout).foregroundStyle(.secondary)
            LabeledField(label: "Repository URL") {
                TextField("https://example.com/org/repo.git", text: $url)
                    .textFieldStyle(.roundedBorder).disabled(isWorking)
                    .onSubmit { if validationError == nil { clone() } }
            }
            LabeledField(label: "Local path") {
                HStack {
                    TextField("Parent directory", text: $localPath)
                        .textFieldStyle(.roundedBorder).disabled(isWorking)
                    Button("Browse…") { browse() }.disabled(isWorking)
                }
            }
            LabeledField(label: "Branch (optional)") {
                TextField("Default branch", text: $branch)
                    .textFieldStyle(.roundedBorder).disabled(isWorking)
            }
            Text("Will clone to \(resolvedDestination)")
                .font(.caption).foregroundStyle(.secondary)
            if let validationError, !url.isEmpty {
                Text(validationError).font(.caption).foregroundStyle(.red)
            }
            if let errorMessage {
                Text(errorMessage).font(.caption).foregroundStyle(.red).textSelection(.enabled)
            }
            if isWorking {
                VStack(alignment: .leading, spacing: 4) {
                    Text(progressTitle).font(.caption).foregroundStyle(.secondary)
                    ProgressView(value: progressValue, total: 1)
                        .progressViewStyle(.linear)
                }
            }
            HStack {
                Spacer()
                Button(isWorking ? "Cancel Clone" : "Cancel") {
                    if isWorking {
                        cloneTask?.cancel()
                        isWorking = false
                    } else {
                        store.closePopup(popup)
                    }
                }
                .keyboardShortcut(.cancelAction)
                Button("Clone") { clone() }
                    .keyboardShortcut(.defaultAction)
                    .buttonStyle(.borderedProminent)
                    .disabled(validationError != nil || isWorking)
            }
        }
        .padding(20).frame(width: 500)
    }

    private func browse() {
        let panel = NSOpenPanel()
        panel.canChooseFiles = false
        panel.canChooseDirectories = true
        panel.canCreateDirectories = true
        if panel.runModal() == .OK, let url = panel.url {
            localPath = url.path
        }
    }

    private func clone() {
        guard validationError == nil else { return }
        let remoteURL = url.trimmingCharacters(in: .whitespacesAndNewlines)
        let destination = resolvedDestination
        let branchName = branch.trimmingCharacters(in: .whitespacesAndNewlines)
        isWorking = true
        errorMessage = nil
        progressValue = 0
        let cloning = CloningRepository(path: destination, url: remoteURL)
        cloneTask = Task { @MainActor in
            do {
                try await RepositoryManagement.clone(
                    url: remoteURL, destinationPath: destination,
                    branch: branchName.isEmpty ? nil : branchName,
                    progress: { event in
                        Task { @MainActor in
                            progressValue = event.value ?? 0
                            progressTitle = event.title ?? "Cloning…"
                        }
                    })
                if Task.isCancelled { return }
                let repo = Repository(path: destination, id: store.nextRepositoryID())
                store.addRepositories([repo])
                store.persistRepositories()
                _ = cloning
                store.closePopup(popup)
            } catch let error as GitError {
                if Task.isCancelled { return }
                errorMessage = error.displayMessage
                isWorking = false
            } catch {
                if Task.isCancelled { return }
                errorMessage = error.localizedDescription
                isWorking = false
            }
        }
    }
}

// MARK: - Shared bits

struct LabeledField<Content: View>: View {
    var label: String
    @ViewBuilder var content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label).font(.caption).foregroundStyle(.secondary)
            content()
        }
    }
}
