import SwiftUI

// MARK: - Branch dialogs
// Ports of `create-branch-dialog.tsx`, `rename-branch-dialog.tsx` and
// `delete-branch-dialog.tsx` (fork-link and PR surfaces deleted per scope).
// All three are plain views so Task 2's DialogHost can present them in a
// `.sheet(item:)`; validation is synchronous + debounced rule check folded
// into one pass (no network rulesets in Task 5).

// MARK: Create

public enum BranchStartPoint: String, CaseIterable, Sendable {
    case currentBranch = "Current branch"
    case defaultBranch = "Default branch"
    case head = "HEAD"
    case commit = "Commit"
}

public struct CreateBranchDialog: View {
    @State private var branchName: String
    @State private var startPoint: BranchStartPoint
    var existingNames: [String]
    var defaultBranchName: String?
    var currentBranchName: String?
    var fixedTargetCommitSHA: String?
    var isCreating: Bool
    var onCreate: ((String, BranchStartPoint) -> Void)?
    var onCancel: (() -> Void)?

    public init(
        initialName: String = "",
        startPoint: BranchStartPoint = .currentBranch,
        existingNames: [String] = [],
        defaultBranchName: String? = nil,
        currentBranchName: String? = nil,
        fixedTargetCommitSHA: String? = nil,
        isCreating: Bool = false,
        onCreate: ((String, BranchStartPoint) -> Void)? = nil,
        onCancel: (() -> Void)? = nil
    ) {
        self._branchName = State(initialValue: initialName)
        self._startPoint = State(initialValue: fixedTargetCommitSHA == nil ? startPoint : .commit)
        self.existingNames = existingNames
        self.defaultBranchName = defaultBranchName
        self.currentBranchName = currentBranchName
        self.fixedTargetCommitSHA = fixedTargetCommitSHA
        self.isCreating = isCreating
        self.onCreate = onCreate
        self.onCancel = onCancel
    }

    private var validation: BranchNameValidation {
        validateBranchName(branchName, existingNames: existingNames)
    }

    private var canSubmit: Bool {
        !isCreating && validation == .ok
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Create branch")
                .font(.headline)
            VStack(alignment: .leading, spacing: 4) {
                Text("Branch name")
                    .font(.callout)
                TextField("Branch name", text: $branchName)
                    .textFieldStyle(.roundedBorder)
                    .accessibilityLabel("Branch name")
                    .disabled(isCreating)
                validationMessage
            }
            if let sha = fixedTargetCommitSHA {
                Text("This branch will be based on \(shortenSHA(sha)).")
                    .font(.callout)
                    .foregroundStyle(.secondary)
            } else {
                Picker("Based on", selection: $startPoint) {
                    if let current = currentBranchName {
                        Text("Current branch (\(current))").tag(BranchStartPoint.currentBranch)
                    } else {
                        Text(BranchStartPoint.currentBranch.rawValue).tag(BranchStartPoint.currentBranch)
                    }
                    if let def = defaultBranchName {
                        Text("Default branch (\(def))").tag(BranchStartPoint.defaultBranch)
                    }
                    Text("HEAD").tag(BranchStartPoint.head)
                }
                .pickerStyle(.radioGroup)
                .accessibilityLabel("Start point")
            }
            HStack {
                Spacer()
                Button("Cancel", role: .cancel) { onCancel?() }
                    .keyboardShortcut(.cancelAction)
                Button("Create branch") {
                    onCreate?(branchName.trimmingCharacters(in: .whitespaces), startPoint)
                }
                .keyboardShortcut(.defaultAction)
                .buttonStyle(.borderedProminent)
                .disabled(!canSubmit)
            }
        }
        .padding(16)
        .frame(minWidth: 380)
    }

    @ViewBuilder
    private var validationMessage: some View {
        switch validation {
        case .ok:
            if let remote = existingRemoteWarning {
                HStack(spacing: 4) {
                    Image(systemName: "exclamationmark.triangle").foregroundStyle(.yellow)
                    Text("A branch named \(remote) already exists on the remote.")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }
        case .empty:
            EmptyView()
        case .invalid(let reason):
            Text(reason).font(.caption).foregroundStyle(.red)
        case .duplicate:
            Text("A branch with that name already exists.").font(.caption).foregroundStyle(.red)
        }
    }

    private var existingRemoteWarning: String? {
        // Local-only check: a remote-tracking name colliding with the new name.
        let trimmed = branchName.trimmingCharacters(in: .whitespaces)
        if existingNames.contains(where: { $0 == "origin/\(trimmed)" }) { return trimmed }
        return nil
    }
}

// MARK: Rename

public struct RenameBranchDialog: View {
    var branch: Branch
    var existingNames: [String]
    @State private var newName: String
    var isRenaming: Bool
    var onRename: ((String) -> Void)?
    var onCancel: (() -> Void)?

    public init(
        branch: Branch,
        existingNames: [String] = [],
        isRenaming: Bool = false,
        onRename: ((String) -> Void)? = nil,
        onCancel: (() -> Void)? = nil
    ) {
        self.branch = branch
        self.existingNames = existingNames
        self._newName = State(initialValue: branch.name)
        self.isRenaming = isRenaming
        self.onRename = onRename
        self.onCancel = onCancel
    }

    private var validation: BranchNameValidation {
        if newName == branch.name { return .empty }
        return validateBranchName(newName, existingNames: existingNames)
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Rename \(branch.name)")
                .font(.headline)
            VStack(alignment: .leading, spacing: 4) {
                Text("New branch name")
                    .font(.callout)
                TextField("New branch name", text: $newName)
                    .textFieldStyle(.roundedBorder)
                    .accessibilityLabel("New branch name")
                    .disabled(isRenaming)
                switch validation {
                case .ok, .empty:
                    EmptyView()
                case .invalid(let reason):
                    Text(reason).font(.caption).foregroundStyle(.red)
                case .duplicate:
                    if isCaseOnlyRename(from: branch.name, to: newName.trimmingCharacters(in: .whitespaces)) {
                        Text("Only the case will change; the rename will be forced.")
                            .font(.caption).foregroundStyle(.secondary)
                    } else {
                        Text("A branch with that name already exists.").font(.caption).foregroundStyle(.red)
                    }
                }
            }
            if branch.upstream != nil {
                HStack(spacing: 4) {
                    Image(systemName: "exclamationmark.triangle").foregroundStyle(.yellow)
                    Text("This branch is tracking \(branch.upstream ?? "") and renaming will not change the branch name on the remote.")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }
            HStack {
                Spacer()
                Button("Cancel", role: .cancel) { onCancel?() }
                    .keyboardShortcut(.cancelAction)
                Button("Rename \(branch.name)") {
                    onRename?(newName.trimmingCharacters(in: .whitespaces))
                }
                .keyboardShortcut(.defaultAction)
                .buttonStyle(.borderedProminent)
                .disabled(isRenaming || (validation != .ok && !isCaseOnlyForceable))
            }
        }
        .padding(16)
        .frame(minWidth: 380)
    }

    private var isCaseOnlyForceable: Bool {
        isCaseOnlyRename(from: branch.name, to: newName.trimmingCharacters(in: .whitespaces))
    }
}

// MARK: Delete

public struct DeleteBranchDialog: View {
    var branch: Branch
    var existsOnRemote: Bool
    @State private var includeRemoteBranch: Bool = false
    var isDeleting: Bool
    var onDelete: ((Bool) -> Void)?
    var onCancel: (() -> Void)?

    public init(
        branch: Branch,
        existsOnRemote: Bool = false,
        isDeleting: Bool = false,
        onDelete: ((Bool) -> Void)? = nil,
        onCancel: (() -> Void)? = nil
    ) {
        self.branch = branch
        self.existsOnRemote = existsOnRemote
        self.isDeleting = isDeleting
        self.onDelete = onDelete
        self.onCancel = onCancel
    }

    private var showsRemoteCheckbox: Bool {
        branch.upstreamRemoteName != nil && existsOnRemote
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Delete branch \(branch.name)?")
                .font(.headline)
            Text("Deleting this branch is irreversible.")
                .font(.callout)
                .foregroundStyle(.secondary)
            if showsRemoteCheckbox {
                Toggle("Also delete the branch on the remote", isOn: $includeRemoteBranch)
                    .accessibilityLabel("Also delete the branch on the remote")
            }
            HStack {
                Spacer()
                Button("Cancel", role: .cancel) { onCancel?() }
                    .keyboardShortcut(.cancelAction)
                Button("Delete", role: .destructive) {
                    onDelete?(includeRemoteBranch)
                }
                .keyboardShortcut(.defaultAction)
                .buttonStyle(.borderedProminent)
                .disabled(isDeleting)
            }
        }
        .padding(16)
        .frame(minWidth: 380)
    }
}
