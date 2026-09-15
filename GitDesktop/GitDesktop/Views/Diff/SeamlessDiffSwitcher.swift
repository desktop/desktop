import SwiftUI

// MARK: - SeamlessDiffSwitcher
// Renderer picker + empty-state gates. Port of
// `electron/app/src/ui/diff/index.tsx` (`Diff`) and
// `seamless-diff-switcher.tsx` (minus its async `getFileContents` fetch —
// owners pass `fileContents` directly; a nil `diff` renders the loading
// indicator, matching the switcher's loading state).
//
// Plugs into the Changes tab (Task 3, editable) and history/stash viewers
// (Tasks 5/8, `readOnly: true`) via `DiffFileDescriptor`.

public struct SeamlessDiffSwitcher: View {
    let file: DiffFileDescriptor
    let diff: Diff?
    let fileContents: DiffFileContents?
    let readOnly: Bool
    let repositoryPath: String
    let imageDiffType: ImageDiffType
    let hideWhitespace: Bool
    let showSideBySide: Bool
    let showCheckMarks: Bool
    let askForConfirmationOnDiscard: Bool
    let selection: DiffSelection?
    var onIncludeChanged: ((DiffSelection) -> Void)?
    var onDiscardChanges: ((DiffSelection) -> Void)?
    var onHideWhitespaceChanged: ((Bool) -> Void)?
    var onShowSideBySideChanged: ((Bool) -> Void)?
    var onChangeImageDiffType: ((ImageDiffType) -> Void)?
    var onOpenSubmodule: ((String) -> Void)?
    var onRevealBinary: ((String) -> Void)?

    @State private var forceShowLargeDiff = false

    public init(
        file: DiffFileDescriptor,
        diff: Diff?,
        fileContents: DiffFileContents? = nil,
        readOnly: Bool = false,
        repositoryPath: String = "",
        imageDiffType: ImageDiffType = .twoUp,
        hideWhitespace: Bool = false,
        showSideBySide: Bool = false,
        showCheckMarks: Bool = true,
        askForConfirmationOnDiscard: Bool = true,
        selection: DiffSelection? = nil,
        onIncludeChanged: ((DiffSelection) -> Void)? = nil,
        onDiscardChanges: ((DiffSelection) -> Void)? = nil,
        onHideWhitespaceChanged: ((Bool) -> Void)? = nil,
        onShowSideBySideChanged: ((Bool) -> Void)? = nil,
        onChangeImageDiffType: ((ImageDiffType) -> Void)? = nil,
        onOpenSubmodule: ((String) -> Void)? = nil,
        onRevealBinary: ((String) -> Void)? = nil
    ) {
        self.file = file
        self.diff = diff
        self.fileContents = fileContents
        self.readOnly = readOnly
        self.repositoryPath = repositoryPath
        self.imageDiffType = imageDiffType
        self.hideWhitespace = hideWhitespace
        self.showSideBySide = showSideBySide
        self.showCheckMarks = showCheckMarks
        self.askForConfirmationOnDiscard = askForConfirmationOnDiscard
        self.selection = selection
        self.onIncludeChanged = onIncludeChanged
        self.onDiscardChanges = onDiscardChanges
        self.onHideWhitespaceChanged = onHideWhitespaceChanged
        self.onShowSideBySideChanged = onShowSideBySideChanged
        self.onChangeImageDiffType = onChangeImageDiffType
        self.onOpenSubmodule = onOpenSubmodule
        self.onRevealBinary = onRevealBinary
    }

    public var body: some View {
        VStack(spacing: 0) {
            DiffHeader(
                path: file.path,
                status: file.status,
                showOptions: diff?.type != .submodule,
                hideWhitespace: hideWhitespace,
                showSideBySide: showSideBySide,
                onHideWhitespaceChanged: onHideWhitespaceChanged,
                onShowSideBySideChanged: onShowSideBySideChanged)
            Divider()
            bodyContent
        }
        .onChange(of: file.id) { _, _ in forceShowLargeDiff = false }
    }

    @ViewBuilder
    private var bodyContent: some View {
        switch diff {
        case .none:
            VStack {
                Spacer()
                ProgressView()
                    .accessibilityLabel("Loading diff")
                Spacer()
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        case .text(let data):
            if data.hunks.isEmpty {
                emptyState
            } else {
                TextDiffView(
                    file: file,
                    diff: data,
                    fileContents: fileContents,
                    readOnly: readOnly,
                    hideWhitespace: hideWhitespace,
                    showSideBySide: showSideBySide,
                    showCheckMarks: showCheckMarks,
                    askForConfirmationOnDiscard: askForConfirmationOnDiscard,
                    selection: selection,
                    onIncludeChanged: onIncludeChanged,
                    onDiscardChanges: onDiscardChanges,
                    onHideWhitespaceChanged: onHideWhitespaceChanged)
            }
        case .largeText(let data):
            if forceShowLargeDiff {
                TextDiffView(
                    file: file,
                    diff: TextDiffData(
                        text: data.text, hunks: data.hunks,
                        lineEndingsChange: data.lineEndingsChange,
                        maxLineNumber: data.maxLineNumber,
                        hasHiddenBidiChars: data.hasHiddenBidiChars),
                    fileContents: fileContents,
                    readOnly: readOnly,
                    hideWhitespace: hideWhitespace,
                    showSideBySide: showSideBySide,
                    showCheckMarks: showCheckMarks,
                    askForConfirmationOnDiscard: askForConfirmationOnDiscard,
                    selection: selection,
                    onIncludeChanged: onIncludeChanged,
                    onDiscardChanges: onDiscardChanges,
                    onHideWhitespaceChanged: onHideWhitespaceChanged)
            } else {
                largeDiffGate
            }
        case .binary:
            BinaryFileView(
                path: file.path,
                repositoryPath: repositoryPath,
                onReveal: onRevealBinary)
        case .image(let previous, let current):
            imageContent(previous: previous, current: current)
        case .submodule(let data):
            SubmoduleDiffView(
                diff: data,
                readOnly: readOnly,
                onOpenSubmodule: onOpenSubmodule)
        case .unrenderable:
            emptyPanel("The diff is too large to be displayed.")
        }
    }

    // MARK: Empty states (exact strings from `diff/index.tsx`)

    @ViewBuilder
    private var emptyState: some View {
        let kind = file.status.kind
        if kind == .new || kind == .untracked {
            emptyPanel("The file is empty")
        } else if kind == .renamed {
            if DiffSupport.renameIncludesModifications(file.status) {
                VStack(spacing: 8) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .foregroundStyle(.yellow)
                    Text("The file was renamed and includes changes.")
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .padding()
            } else {
                emptyPanel("The file was renamed but not changed")
            }
        } else if DiffSupport.isManualConflict(file.status) {
            emptyPanel("The file is in conflict and must be resolved via the command line.")
        } else if hideWhitespace {
            emptyPanel("Only whitespace changes found")
        } else {
            emptyPanel("No content changes found")
        }
    }

    private func emptyPanel(_ message: String) -> some View {
        Text(message)
            .font(.system(size: 12))
            .foregroundStyle(.secondary)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .padding()
    }

    private var largeDiffGate: some View {
        VStack(spacing: 8) {
            Image(systemName: "doc.fill")
                .font(.system(size: 32))
                .foregroundStyle(.secondary)
            Text("The diff is too large to be displayed by default.")
            Text("You can try to show it anyway, but performance may be negatively impacted.")
                .foregroundStyle(.secondary)
            Button("Show Diff") { forceShowLargeDiff = true }
                .buttonStyle(.link)
        }
        .font(.system(size: 12))
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding()
    }

    @ViewBuilder
    private func imageContent(previous: DiffImage?, current: DiffImage?) -> some View {
        if let previous, let current {
            ModifiedImageDiffView(
                previous: previous, current: current,
                diffType: imageDiffType,
                onChangeDiffType: onChangeImageDiffType)
        } else if let current,
                  file.status.kind == .new || file.status.kind == .untracked {
            NewImageDiffView(current: current)
        } else if let previous, file.status.kind == .deleted {
            DeletedImageDiffView(previous: previous)
        }
    }
}

#Preview {
    SeamlessDiffSwitcher(
        file: DiffFixtures.modifiedFile(),
        diff: .text(DiffFixtures.smallTextDiff()),
        fileContents: DiffFixtures.smallContents(),
        selection: .fromInitialSelection(.all),
        onIncludeChanged: { _ in },
        onDiscardChanges: { _ in },
        onHideWhitespaceChanged: { _ in },
        onShowSideBySideChanged: { _ in })
    .frame(width: 640, height: 400)
}
