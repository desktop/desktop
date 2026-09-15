import SwiftUI

// MARK: - CommitBoxView
// Port of `electron/app/src/ui/changes/commit-message.tsx` (~1600 lines,
// replicated minus GH/Copilot per scope): avatar (initials) + branch +
// warnings; summary `TextField` + description `TextEditor` in one
// `FocusContainer` frame; `AuthorInput` co-authors (always available, not
// GH-gated); action bar (co-author toggle, gear commit-options); submit
// `Commit to <branch>` (`Commit N files to …`), spinner, live-region.
// The Apple Intelligence generate button is Task 10, not here.

public struct CommitBoxView: View {
    @ObservedObject public var changes: ChangesStore

    @FocusState private var focusedField: CommitBoxField?
    @State private var autocomplete: CommitAutocompleteState?

    public init(changes: ChangesStore) {
        self.changes = changes
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            headerRow
            if changes.commitToAmend != nil {
                amendNotice
            }
            focusContainer
            lengthWarning
            if changes.showCoAuthors {
                authorInput
            }
            actionBar
            submitRow
            if changes.isCommitting, let progress = changes.hookProgress {
                commitProgressRow(progress)
            }
        }
        .padding(10)
        .contextMenu { rootContextMenu }
        .sheet(
            isPresented: Binding(
                get: {
                    changes.pendingConfirm != nil || changes.hookFailure != nil
                },
                set: { presented in
                    if !presented {
                        changes.cancelPendingConfirm()
                        changes.hookFailure = nil
                    }
                }),
            content: { commitSheet }
        )
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Commit message")
    }

    // MARK: Header (avatar + branch + warnings)

    private var headerRow: some View {
        HStack(spacing: 8) {
            CommitAvatar(name: changes.commitAuthor?.name)
            if let branch = changes.branch {
                BranchPill(name: branch)
            } else {
                Text("Detached HEAD")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
        }
        .accessibilityElement(children: .combine)
    }

    private var amendNotice: some View {
        CommitWarningView(
            style: .information,
            message: "Amending the last commit.")
            .overlay(alignment: .trailing) {
                Button("Stop amending") {
                    changes.stopAmending()
                }
                .buttonStyle(.link)
                .font(.callout)
                .padding(.trailing, 8)
            }
    }

    // MARK: Focus container (summary + description)

    private var focusContainer: some View {
        VStack(spacing: 0) {
            TextField(changes.placeholder, text: $changes.summary)
                .textFieldStyle(.plain)
                .focused($focusedField, equals: .summary)
                .autocorrectionDisabled(!changes.spellcheckEnabled)
                .padding(6)
                .onChange(of: changes.summary) { _, new in
                    updateAutocomplete(for: new, field: .summary)
                }
            Divider()
            TextEditor(text: $changes.commitDescription)
                .focused($focusedField, equals: .description)
                .autocorrectionDisabled(!changes.spellcheckEnabled)
                .frame(minHeight: 60, maxHeight: 160)
                .scrollContentBackground(.hidden)
                .font(.body)
                .padding(.horizontal, 2)
                .onChange(of: changes.commitDescription) { _, new in
                    updateAutocomplete(for: new, field: .description)
                }
            if let autocomplete {
                CommitAutocompletePopup(
                    state: autocomplete,
                    onSelect: { applyCompletion($0, field: focusedField ?? .summary) },
                    onDismiss: { self.autocomplete = nil })
            }
        }
        .overlay(
            RoundedRectangle(cornerRadius: 6)
                .stroke(Color(nsColor: .separatorColor)))
    }

    private var lengthWarning: some View {
        Group {
            if changes.showCommitLengthWarning && changes.summary.count > 72 {
                CommitWarningView(
                    style: .warning,
                    message:
                        "Summary is \(changes.summary.count) characters — great commit summaries stay under 72.")
            }
        }
    }

    // MARK: Co-authors (AuthorInput, always available)

    @State private var coAuthorDraft = ""

    private var authorInput: some View {
        VStack(alignment: .leading, spacing: 4) {
            ForEach(changes.coAuthors, id: \.self) { author in
                HStack {
                    Image(systemName: "person.circle")
                        .foregroundStyle(.secondary)
                    Text(authorDisplayName(author))
                        .font(.callout)
                        .lineLimit(1)
                    Spacer()
                    Button {
                        changes.coAuthors.removeAll { $0 == author }
                    } label: {
                        Image(systemName: "xmark")
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Remove co-author \(authorDisplayName(author))")
                }
            }
            TextField("Add co-author: Name <email>", text: $coAuthorDraft)
                .textFieldStyle(.roundedBorder)
                .focused($focusedField, equals: .coAuthor)
                .autocorrectionDisabled(true)
                .onSubmit { addCoAuthorDraft() }
        }
    }

    private func addCoAuthorDraft() {
        let draft = coAuthorDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !draft.isEmpty else { return }
        if let parsed = GitAuthor.parse(draft) {
            changes.coAuthors.append(.known(
                name: parsed.name, email: parsed.email, username: nil))
        } else {
            changes.coAuthors.append(.unknown(
                username: draft, state: .error))
        }
        coAuthorDraft = ""
    }

    // MARK: Action bar

    private var actionBar: some View {
        HStack(spacing: 4) {
            Button {
                if !changes.showCoAuthors {
                    changes.showCoAuthors = true
                } else if changes.coAuthors.isEmpty {
                    changes.showCoAuthors = false
                } else {
                    changes.coAuthors = []
                }
                focusedField = .coAuthor
            } label: {
                Image(systemName: changes.showCoAuthors
                    ? "person.badge.minus" : "person.badge.plus")
            }
            .buttonStyle(.plain)
            .help(changes.showCoAuthors ? "Remove co-authors" : "Add co-authors")
            .accessibilityLabel(changes.showCoAuthors ? "Remove co-authors" : "Add co-authors")

            // Task 10: Apple Intelligence generate (hidden when unavailable).
            CommitAIGenerationButton(changes: changes)

            Menu {
                Toggle("Skip commit hooks (--no-verify)",
                       isOn: $changes.skipCommitHooks)
                Toggle("Add Signed-off-by trailer (--signoff)",
                       isOn: $changes.signOffCommits)
                Toggle("Allow empty commit (--allow-empty)",
                       isOn: $changes.allowEmptyCommit)
                Divider()
                Toggle("Enable commit spellcheck",
                       isOn: spellcheckBinding)
            } label: {
                Image(systemName: "gearshape")
            }
            .menuStyle(.borderlessButton)
            .help("Commit options")
            .accessibilityLabel("Commit options")

            Spacer()
        }
    }

    private var spellcheckBinding: Binding<Bool> {
        Binding(
            get: { changes.spellcheckEnabled },
            set: {
                changes.spellcheckEnabled = $0
                Defaults.setBool($0, Defaults.commitSpellcheckEnabled)
            })
    }

    private var rootContextMenu: some View {
        Group {
            if changes.showCoAuthors {
                Button("Remove Co-Authors") {
                    changes.showCoAuthors = false
                    changes.coAuthors = []
                }
            } else {
                Button("Add Co-Authors") {
                    changes.showCoAuthors = true
                    focusedField = .coAuthor
                }
            }
            Button(changes.spellcheckEnabled
                ? "Disable commit spellcheck"
                : "Enable commit spellcheck") {
                spellcheckBinding.wrappedValue.toggle()
            }
        }
    }

    // MARK: Submit

    private var submitRow: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Button {
                    changes.commit()
                } label: {
                    HStack(spacing: 6) {
                        if changes.isCommitting {
                            ProgressView()
                                .controlSize(.small)
                        }
                        Text(changes.commitButtonTitle)
                    }
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .disabled(!changes.validation.canSubmit || changes.isCommitting)
                .help(changes.validation.blockReason ?? changes.commitButtonTitle)
                .keyboardShortcut(.return, modifiers: .command)
                .accessibilityHint(
                    changes.validation.blockReason ?? changes.commitButtonTitle)
                if let reason = changes.validation.blockReason {
                    Text(reason)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
    }

    private func commitProgressRow(_ progress: String) -> some View {
        HStack(spacing: 6) {
            ProgressView()
                .controlSize(.small)
            Text(progress)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(progress)
    }

    // MARK: Sheets (confirms + hook failure)

    @ViewBuilder
    private var commitSheet: some View {
        if let failure = changes.hookFailure {
            HookFailedSheet(
                failure: failure,
                onAbort: { changes.hookFailure = nil },
                onIgnore: {
                    changes.hookFailure = nil
                    changes.skipCommitHooks = true
                    changes.commit()
                })
        } else if let pending = changes.pendingConfirm {
            switch pending {
            case .unknownAuthors(let authors):
                UnknownAuthorsSheet(
                    authors: authors,
                    onCancel: { changes.cancelPendingConfirm() },
                    onCommitAnyway: { changes.acceptPendingConfirm() })
            case .filteredFiles(let count):
                FilteredFilesSheet(
                    count: count,
                    onCancel: { changes.cancelPendingConfirm() },
                    onCommitAnyway: { changes.acceptPendingConfirm() })
            case .oversizedFiles(let paths):
                OversizedFilesSheet(
                    paths: paths,
                    onCancel: { changes.cancelPendingConfirm() },
                    onCommitAnyway: { changes.acceptPendingConfirm() })
            case .conflicts(let files):
                CommitConflictsSheet(
                    files: files,
                    onCancel: { changes.cancelPendingConfirm() },
                    onCommitAnyway: { changes.acceptPendingConfirm() })
            }
        } else {
            EmptyView()
        }
    }

    // MARK: Autocomplete

    private func updateAutocomplete(for text: String, field: CommitBoxField) {
        // Cursor-at-end approximation (SwiftUI exposes no caret here).
        let cursor = (text as NSString).length
        if let query = coAuthorQuery(in: text, cursor: cursor) {
            let hits = filterCoAuthors(changes.localAuthors, query: query)
                .map {
                    CommitAutocompleteItem(
                        kind: .coAuthor,
                        text: authorDisplayName($0),
                        detail: "Co-author")
                }
            autocomplete = CommitAutocompleteState(
                field: field, query: query, trigger: "@", items: hits)
        } else if let query = emojiQuery(in: text, cursor: cursor) {
            let hits = filterEmoji(query: query).map {
                CommitAutocompleteItem(
                    kind: .emoji, text: $0.character, detail: ":\($0.name):")
            }
            autocomplete = CommitAutocompleteState(
                field: field, query: query, trigger: ":", items: hits)
        } else {
            autocomplete = nil
        }
    }

    private func applyCompletion(_ item: CommitAutocompleteItem, field: CommitBoxField) {
        guard let state = autocomplete else { return }
        let replacement = item.text + " "
        switch field {
        case .summary:
            changes.summary = replaceTrigger(
                in: changes.summary, trigger: state.trigger,
                query: state.query, replacement: replacement)
        case .description:
            changes.commitDescription = replaceTrigger(
                in: changes.commitDescription, trigger: state.trigger,
                query: state.query, replacement: replacement)
        case .coAuthor:
            coAuthorDraft = ""
            if let parsed = GitAuthor.parse(item.text) {
                changes.coAuthors.append(.known(
                    name: parsed.name, email: parsed.email, username: nil))
            }
        }
        autocomplete = nil
    }

    private func replaceTrigger(
        in text: String, trigger: String, query: String, replacement: String
    ) -> String {
        guard let range = text.range(
            of: "\(trigger)\(query)",
            options: [.caseInsensitive, .backwards]) else {
            return text + replacement
        }
        return text.replacingCharacters(in: range, with: replacement)
    }
}

// MARK: - Supporting views

/// Initials avatar (no GH images per scope). Port of `commit-message-avatar`.
public struct CommitAvatar: View {
    public var name: String?

    public init(name: String?) {
        self.name = name
    }

    private var initials: String {
        guard let name, !name.isEmpty else { return "?" }
        let parts = name.split(separator: " ")
        let letters = parts.prefix(2).compactMap(\.first)
        return String(letters).uppercased()
    }

    public var body: some View {
        Text(initials)
            .font(.caption)
            .fontWeight(.semibold)
            .frame(width: 28, height: 28)
            .background(Color(nsColor: .controlBackgroundColor))
            .clipShape(Circle())
            .accessibilityLabel(name.map { "Author \($0)" } ?? "Unknown author")
    }
}

/// Branch pill. Port of `ui/lib/ref.tsx`.
public struct BranchPill: View {
    public var name: String

    public init(name: String) {
        self.name = name
    }

    public var body: some View {
        HStack(spacing: 4) {
            Image(systemName: "arrow.triangle.branch")
                .font(.caption)
            Text(name)
                .font(.callout)
                .lineLimit(1)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 3)
        .background(Color.accentColor.opacity(0.12))
        .clipShape(Capsule())
        .accessibilityLabel("Branch \(name)")
    }
}

private struct CommitAutocompleteState: Equatable {
    var field: CommitBoxField
    var query: String
    var trigger: String
    var items: [CommitAutocompleteItem]
}

private enum CommitBoxField: Hashable {
    case summary
    case description
    case coAuthor
}

private struct CommitAutocompletePopup: View {
    var state: CommitAutocompleteState
    var onSelect: (CommitAutocompleteItem) -> Void
    var onDismiss: () -> Void
    @State private var selectedIndex = 0

    var body: some View {
        Group {
            if !state.items.isEmpty {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(Array(state.items.enumerated()), id: \.element.id) { index, item in
                        Button {
                            onSelect(item)
                        } label: {
                            HStack {
                                Text(item.text)
                                    .lineLimit(1)
                                Spacer()
                                if let detail = item.detail {
                                    Text(detail)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(
                                index == selectedIndex
                                    ? Color.accentColor.opacity(0.2) : Color.clear)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
                .background(Color(nsColor: .windowBackgroundColor))
                .clipShape(RoundedRectangle(cornerRadius: 6))
                .overlay(
                    RoundedRectangle(cornerRadius: 6)
                        .stroke(Color(nsColor: .separatorColor)))
                .frame(maxHeight: 160)
                .onKeyPress { press in
                    switch press.key {
                    case .upArrow:
                        selectedIndex = max(0, selectedIndex - 1)
                        return .handled
                    case .downArrow:
                        selectedIndex = min(state.items.count - 1, selectedIndex + 1)
                        return .handled
                    case .return:
                        guard state.items.indices.contains(selectedIndex) else {
                            return .ignored
                        }
                        onSelect(state.items[selectedIndex])
                        return .handled
                    case .escape:
                        onDismiss()
                        return .handled
                    default:
                        return .ignored
                    }
                }
            }
        }
    }
}

// MARK: - Confirm + hook sheets

/// Unknown co-authors confirm. Port of the `unknownAuthors` flow.
private struct UnknownAuthorsSheet: View {
    var authors: [Author]
    var onCancel: () -> Void
    var onCommitAnyway: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Unknown co-authors")
                .font(.headline)
            Text("These co-authors could not be resolved and will be skipped:")
                .font(.callout)
            ForEach(authors, id: \.self) { author in
                Text("• \(authorDisplayName(author))")
                    .font(.callout)
            }
            HStack {
                Spacer()
                Button("Cancel", action: onCancel)
                    .keyboardShortcut(.cancelAction)
                Button("Commit anyway", action: onCommitAnyway)
                    .keyboardShortcut(.defaultAction)
            }
        }
        .padding(16)
        .frame(width: 380)
    }
}

/// Filtered-files confirm. Port of `ConfirmCommitFilteredChanges`.
private struct FilteredFilesSheet: View {
    var count: Int
    var onCancel: () -> Void
    var onCommitAnyway: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Committing filtered files")
                .font(.headline)
            Text(
                "You are about to commit \(count) \(count == 1 ? "file" : "files"), " +
                "including files hidden by the current filter. Continue?")
                .font(.callout)
            HStack {
                Spacer()
                Button("Cancel", action: onCancel)
                    .keyboardShortcut(.cancelAction)
                Button("Commit", action: onCommitAnyway)
                    .keyboardShortcut(.defaultAction)
            }
        }
        .padding(16)
        .frame(width: 380)
    }
}

/// Oversized-files (LFS gate) confirm. Port of `OversizedFiles`.
private struct OversizedFilesSheet: View {
    var paths: [String]
    var onCancel: () -> Void
    var onCommitAnyway: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Files too large")
                .font(.headline)
            Text(
                "The following files are over 100MB. If you commit them, " +
                "you will no longer be able to push this repository to a remote:")
                .font(.callout)
            ScrollView {
                VStack(alignment: .leading) {
                    ForEach(paths, id: \.self) { path in
                        PathLabel(path: path)
                            .font(.callout)
                    }
                }
            }
            .frame(maxHeight: 160)
            Text("Avoid committing these files or use Git LFS for large files.")
                .font(.callout)
                .foregroundStyle(.secondary)
            HStack {
                Spacer()
                Button("Cancel", action: onCancel)
                    .keyboardShortcut(.cancelAction)
                Button("Commit anyway", action: onCommitAnyway)
            }
        }
        .padding(16)
        .frame(width: 420)
    }
}

/// Conflicts confirm. Port of `CommitConflictsWarning`.
private struct CommitConflictsSheet: View {
    var files: [WorkingDirectoryFileChange]
    var onCancel: () -> Void
    var onCommitAnyway: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Commit with conflicts?")
                .font(.headline)
            Text(
                "The following conflicted files still contain markers. " +
                "Committing them will keep the markers in your history:")
                .font(.callout)
            ForEach(files) { file in
                PathLabel(path: file.path)
                    .font(.callout)
            }
            HStack {
                Spacer()
                Button("Cancel", action: onCancel)
                    .keyboardShortcut(.cancelAction)
                Button("Commit anyway", action: onCommitAnyway)
            }
        }
        .padding(16)
        .frame(width: 400)
    }
}

/// Hook failure sheet: abort or ignore. Port of `hook-failed`.
private struct HookFailedSheet: View {
    var failure: HookFailure
    var onAbort: () -> Void
    var onIgnore: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Hook failed: \(failure.hookName)")
                .font(.headline)
            ScrollView {
                Text(failure.output)
                    .font(.system(.callout, design: .monospaced))
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .frame(maxHeight: 200)
            HStack {
                Spacer()
                Button("Abort", action: onAbort)
                    .keyboardShortcut(.cancelAction)
                Button("Ignore and commit", action: onIgnore)
                    .keyboardShortcut(.defaultAction)
            }
        }
        .padding(16)
        .frame(width: 440)
    }
}
