import SwiftUI

// MARK: - Tag views
// Port of the tag slice of `electron/app/src/ui/` (`create-tag` / `delete-tag`
// dialogs + tag badges in history). Create is always annotated
// (`tag -a -m ''`), matching `TagLiveOperations`.

/// One tag row: name + target short SHA + unpushed indicator.
public struct TagRow: View {
    public var name: String
    public var targetSha: String
    public var isUnpushed: Bool
    public var onDelete: (() -> Void)?

    public init(name: String, targetSha: String, isUnpushed: Bool = false, onDelete: (() -> Void)? = nil) {
        self.name = name
        self.targetSha = targetSha
        self.isUnpushed = isUnpushed
        self.onDelete = onDelete
    }

    public var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "tag")
                .foregroundStyle(.secondary)
                .accessibilityHidden(true)
            Text(name)
                .font(.system(size: 12, weight: .medium))
                .lineLimit(1)
            if isUnpushed {
                Circle()
                    .fill(.orange)
                    .frame(width: 7, height: 7)
                    .help("Unpushed tag")
                    .accessibilityLabel("Unpushed tag")
            }
            Spacer()
            Text(shortenSHA(targetSha))
                .font(.caption.monospaced())
                .foregroundStyle(.secondary)
            if let onDelete {
                Button("Delete", action: onDelete)
                    .buttonStyle(.link)
                    .controlSize(.small)
            }
        }
        .padding(.vertical, 2)
    }
}

/// Inline validation for the Create Tag dialog (mirrors `TagOperations.validateTagName`).
public struct CreateTagForm: View {
    public var targetCommitSha: String
    public var targetSummary: String?
    public var existingTags: Set<String>
    public var initialName: String
    public var isCreating: Bool
    public var onCancel: () -> Void
    public var onCreate: (String) -> Void

    @State private var name: String

    public init(
        targetCommitSha: String,
        targetSummary: String? = nil,
        existingTags: Set<String> = [],
        initialName: String = "",
        isCreating: Bool = false,
        onCancel: @escaping () -> Void = {},
        onCreate: @escaping (String) -> Void = { _ in }
    ) {
        self.targetCommitSha = targetCommitSha
        self.targetSummary = targetSummary
        self.existingTags = existingTags
        self.initialName = initialName
        self.isCreating = isCreating
        self.onCancel = onCancel
        self.onCreate = onCreate
        _name = State(initialValue: initialName)
    }

    private var error: String? {
        TagOperations.validateTagName(name, existingTags: existingTags)
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Create Tag")
                .font(.headline)
            Text("Tag \(shortenSHA(targetCommitSha))\(targetSummary.map { " “\($0)”" } ?? "") with an annotated tag.")
                .font(.caption)
                .foregroundStyle(.secondary)
            TextField("Tag name (e.g. v1.0.0)", text: $name)
                .textFieldStyle(.roundedBorder)
                .disabled(isCreating)
                .onSubmit {
                    if error == nil { onCreate(name.trimmingCharacters(in: .whitespacesAndNewlines)) }
                }
            if let error, !name.isEmpty {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(.red)
                    .accessibilityLabel("Tag name error: \(error)")
            }
            HStack {
                Spacer()
                Button("Cancel", action: onCancel)
                    .buttonStyle(.bordered)
                    .disabled(isCreating)
                Button("Create Tag") {
                    onCreate(name.trimmingCharacters(in: .whitespacesAndNewlines))
                }
                .buttonStyle(.borderedProminent)
                .disabled(error != nil || isCreating)
                .keyboardShortcut(.defaultAction)
            }
            if isCreating { ProgressView().controlSize(.small) }
        }
        .padding(16)
        .frame(minWidth: 360)
    }
}

#Preview {
    VStack {
        TagRow(name: "v1.0.0", targetSha: "abc1234567890", isUnpushed: true)
        CreateTagForm(targetCommitSha: "abc1234567890", targetSummary: "Add engine", existingTags: ["v0.9"])
    }
    .padding()
}
