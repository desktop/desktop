import AppKit
import SwiftUI

// MARK: - TextDiffView
// Unified + side-by-side text diff. Port of
// `electron/app/src/ui/diff/side-by-side-diff.tsx` (+ row rendering from
// `side-by-side-diff-row.tsx`, find bar from `diff-search-input.tsx`).
//
// The parent owns selection state and prefs; this view reports gutter
// toggles via `onIncludeChanged`, discard requests via `onDiscardChanges`
// (with a selection containing only the target lines), and pref changes via
// `onHideWhitespaceChanged`. History (read-only) passes `readOnly: true`
// and no callbacks — see `SeamlessDiffSwitcher`.

public struct TextDiffView: View {
    public static let rowHeight: Double = 20

    let file: DiffFileDescriptor
    let initialDiff: TextDiffData
    let fileContents: DiffFileContents?
    let readOnly: Bool
    let hideWhitespace: Bool
    let showSideBySide: Bool
    let showCheckMarks: Bool
    let askForConfirmationOnDiscard: Bool
    let selection: DiffSelection?
    var onIncludeChanged: ((DiffSelection) -> Void)?
    var onDiscardChanges: ((DiffSelection) -> Void)?
    var onHideWhitespaceChanged: ((Bool) -> Void)?

    @State private var displayDiff: TextDiffData?
    @State private var wholeFileBackup: TextDiffData?
    @State private var search = DiffSearchState()
    @State private var hoveredGroup: Int?
    @State private var showWhitespaceHint = false
    @State private var dragFromRow: Int?
    @State private var dragToRow: Int?
    @State private var dragSelects = true
    @Environment(\.colorScheme) private var colorScheme

    public init(
        file: DiffFileDescriptor,
        diff: TextDiffData,
        fileContents: DiffFileContents? = nil,
        readOnly: Bool = false,
        hideWhitespace: Bool = false,
        showSideBySide: Bool = false,
        showCheckMarks: Bool = true,
        askForConfirmationOnDiscard: Bool = true,
        selection: DiffSelection? = nil,
        onIncludeChanged: ((DiffSelection) -> Void)? = nil,
        onDiscardChanges: ((DiffSelection) -> Void)? = nil,
        onHideWhitespaceChanged: ((Bool) -> Void)? = nil
    ) {
        self.file = file
        self.initialDiff = diff
        self.fileContents = fileContents
        self.readOnly = readOnly
        self.hideWhitespace = hideWhitespace
        self.showSideBySide = showSideBySide
        self.showCheckMarks = showCheckMarks
        self.askForConfirmationOnDiscard = askForConfirmationOnDiscard
        self.selection = selection
        self.onIncludeChanged = onIncludeChanged
        self.onDiscardChanges = onDiscardChanges
        self.onHideWhitespaceChanged = onHideWhitespaceChanged
    }

    // MARK: Derived state

    private var isInteractive: Bool {
        file.isSelectable && !readOnly && selection != nil && onIncludeChanged != nil
    }

    private var canExpandHunks: Bool {
        guard let contents = fileContents else { return false }
        return contents.canBeExpanded && !contents.newLines.isEmpty
    }

    /// Typed base diff: expansion types assigned (like the reference
    /// parser) so hunk handles render.
    private var typedBase: TextDiffData {
        DiffExpansion.withExpansionTypes(initialDiff)
    }

    /// Base diff plus the bottom dummy hunk (allows expand-down on the last
    /// hunk). Port of the `SeamlessDiffSwitcher.applyFileContents` step.
    private var preparedBase: TextDiffData {
        guard let contents = fileContents,
              contents.canBeExpanded,
              !contents.newLines.isEmpty,
              let withDummy = DiffExpansion.withBottomDummyHunk(
                typedBase,
                oldLineCount: contents.oldLines.count,
                newLineCount: contents.newLines.count)
        else { return typedBase }
        return withDummy
    }

    private var currentDiff: TextDiffData { displayDiff ?? preparedBase }

    private var effectiveSelection: DiffSelection? {
        guard let selection else { return nil }
        guard let from = dragFromRow, let to = dragToRow else { return selection }
        var updated = selection
        for line in dragLines(fromRow: from, toRow: to) {
            updated = updated.withLineSelection(lineIndex: line, selected: dragSelects)
        }
        return updated
    }

    private var rows: [DiffRow] {
        DiffRowModel.buildRows(
            hunks: currentDiff.hunks,
            showSideBySide: showSideBySide,
            enableExpansion: canExpandHunks,
            selection: effectiveSelection)
    }

    /// Gutter width: spec line-number column is 50px; grow for large files.
    private var gutterSideWidth: Double {
        max(50, DiffRowModel.gutterWidth(forMaxLineNumber: currentDiff.maxLineNumber))
    }

    // MARK: Body

    public var body: some View {
        VStack(spacing: 0) {
            DiffContentsWarning(diff: currentDiff)
            if search.isOpen {
                DiffSearchBar(
                    query: Binding(
                        get: { searchFieldText },
                        set: { searchFieldText = $0 }),
                    message: search.liveMessage,
                    onNext: { stepSearch(.next) },
                    onPrevious: { stepSearch(.previous) },
                    onCommit: { stepSearch(.next) },
                    onClose: { search.close() })
            }
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: 0, pinnedViews: []) {
                        ForEach(rows.indices, id: \.self) { index in
                            rowView(at: index)
                                .id(index)
                        }
                    }
                    .onChange(of: search.selected) { _, newValue in
                        if let hit = search.selectedHit, newValue != nil {
                            withAnimation(.easeOut(duration: 0.15)) {
                                proxy.scrollTo(hit.row, anchor: .center)
                            }
                        }
                    }
                }
            }
        }
        .background(
            Button("") { search.isOpen = true }
                .keyboardShortcut("f", modifiers: .command)
                .opacity(0)
                .frame(width: 0, height: 0))
        .onExitCommand {
            if search.isOpen { search.close() }
        }
        .onReceive(NotificationCenter.default.publisher(for: .gitDesktopMenuAction)) { note in
            guard let action = GitDesktopMenuAction.from(note) else { return }
            switch action {
            case .findInDiff:
                search.isOpen = true
            case .selectAll:
                if isInteractive, let selection {
                    onIncludeChanged?(selection.withSelectAll())
                }
            default:
                break
            }
        }
        .popover(isPresented: $showWhitespaceHint) {
            VStack(alignment: .leading, spacing: 8) {
                Text("Show whitespace changes?")
                    .font(.headline)
                Text("Selecting lines is disabled when hiding whitespace changes.")
                    .font(.body)
                HStack {
                    Spacer()
                    Button("No") { showWhitespaceHint = false }
                        .keyboardShortcut(.cancelAction)
                    Button("Yes") {
                        showWhitespaceHint = false
                        onHideWhitespaceChanged?(false)
                    }
                    .keyboardShortcut(.defaultAction)
                }
            }
            .padding(12)
            .frame(width: 280)
        }
        .onChange(of: initialDiff) { _, _ in resetExpansion() }
        .onChange(of: fileContents) { _, _ in resetExpansion() }
    }

    // Search field text lives outside `search` so typing doesn't commit hits.
    @State private var searchFieldText = ""
}

// MARK: - Rows

private extension TextDiffView {
    @ViewBuilder
    func rowView(at index: Int) -> some View {
        let row = rows[index]
        switch row {
        case .hunk(let content, let expansionType, let hunkIndex):
            HunkRowView(
                content: content,
                expansionType: expansionType,
                hunkIndex: hunkIndex,
                canExpand: canExpandHunks,
                onExpandUp: { expandHunk(at: hunkIndex, kind: .up) },
                onExpandDown: { expandHunk(at: hunkIndex - 1, kind: .down) },
                onExpandAll: { expandHunk(at: hunkIndex, kind: .up) })
            .frame(height: Self.rowHeight)
            .contextMenu { rowMenus(forRow: index) }
        case .context(let content, let before, let after):
            HStack(spacing: 0) {
                if showSideBySide {
                    DiffGutterView(
                        numbers: [before], column: .before, width: gutterSideWidth,
                        data: nil, interactive: false, showCheckMarks: false,
                        isHovered: false, isSelected: false,
                        onHover: { _ in }, onTap: {}, onToggle: { _ in },
                        onDragChanged: { _ in }, onDragEnded: {})
                    diffContent(content: content, changedRange: nil, type: .context)
                    DiffGutterView(
                        numbers: [after], column: .after, width: gutterSideWidth,
                        data: nil, interactive: false, showCheckMarks: false,
                        isHovered: false, isSelected: false,
                        onHover: { _ in }, onTap: {}, onToggle: { _ in },
                        onDragChanged: { _ in }, onDragEnded: {})
                    diffContent(content: content, changedRange: nil, type: .context)
                } else {
                    DiffGutterView(
                        numbers: [before, after], column: .before, width: gutterSideWidth * 2,
                        data: nil, interactive: false, showCheckMarks: false,
                        isHovered: false, isSelected: false,
                        onHover: { _ in }, onTap: {}, onToggle: { _ in },
                        onDragChanged: { _ in }, onDragEnded: {})
                    diffContent(content: content, changedRange: nil, type: .context)
                }
            }
            .frame(height: Self.rowHeight)
            .contextMenu { rowMenus(forRow: index) }
            .accessibilityElement(children: .combine)
            .accessibilityLabel("Unchanged line: \(content)")
        case .added(let data, _), .deleted(let data, _):
            changedRow(at: index, side: row.type == .added ? .after : .before, data: data)
        case .modified(let before, let after, _):
            HStack(spacing: 0) {
                hunkHandle(at: index)
                DiffGutterView(
                    numbers: [before.lineNumber], column: .before, width: gutterSideWidth,
                    data: before, interactive: isInteractive, showCheckMarks: showCheckMarks,
                    isHovered: isGroupHovered(at: index), isSelected: before.isSelected,
                    onHover: { setHover(at: index, hovering: $0) },
                    onTap: { gutterTap(data: before) },
                    onToggle: { setLine(before.diffLineNumber, $0) },
                    onDragChanged: { self.dragChanged(row: index, localY: $0) },
                    onDragEnded: { commitDrag() })
                diffContent(content: before.content, changedRange: before.changedRange, type: .deleted, prefix: "-")
                DiffGutterView(
                    numbers: [after.lineNumber], column: .after, width: gutterSideWidth,
                    data: after, interactive: isInteractive, showCheckMarks: showCheckMarks,
                    isHovered: isGroupHovered(at: index), isSelected: after.isSelected,
                    onHover: { setHover(at: index, hovering: $0) },
                    onTap: { gutterTap(data: after) },
                    onToggle: { setLine(after.diffLineNumber, $0) },
                    onDragChanged: { self.dragChanged(row: index, localY: $0) },
                    onDragEnded: { commitDrag() })
                diffContent(content: after.content, changedRange: after.changedRange, type: .added, prefix: "+")
            }
            .frame(height: Self.rowHeight)
            .background(groupHoverBackground(at: index))
            .contextMenu { rowMenus(forRow: index) }
            .accessibilityElement(children: .combine)
            .accessibilityLabel("Changed line from \(before.content) to \(after.content)")
        }
    }

    /// Unified added/deleted row, or one side of a split added/deleted row.
    func changedRow(at index: Int, side: DiffColumn, data: DiffRowData) -> some View {
        let type: DiffRowType = side == .after ? .added : .deleted
        let prefix = side == .after ? "+" : "-"
        let label = side == .after ? "Added line" : "Removed line"
        return HStack(spacing: 0) {
            hunkHandle(at: index)
            if showSideBySide {
                if side == .after {
                    Color.clear.frame(width: gutterSideWidth)
                    Color.clear.frame(maxWidth: .infinity)
                }
                DiffGutterView(
                    numbers: [data.lineNumber], column: side, width: gutterSideWidth,
                    data: data, interactive: isInteractive, showCheckMarks: showCheckMarks,
                    isHovered: isGroupHovered(at: index), isSelected: data.isSelected,
                    onHover: { setHover(at: index, hovering: $0) },
                    onTap: { gutterTap(data: data) },
                    onToggle: { setLine(data.diffLineNumber, $0) },
                    onDragChanged: { self.dragChanged(row: index, localY: $0) },
                    onDragEnded: { commitDrag() })
                diffContent(content: data.content, changedRange: data.changedRange, type: type, prefix: prefix, noNewline: data.noNewLineIndicator)
                if side == .before {
                    Color.clear.frame(width: gutterSideWidth)
                    Color.clear.frame(maxWidth: .infinity)
                }
            } else {
                DiffGutterView(
                    numbers: side == .after ? [nil, data.lineNumber] : [data.lineNumber, nil],
                    column: side, width: gutterSideWidth * 2,
                    data: data, interactive: isInteractive, showCheckMarks: showCheckMarks,
                    isHovered: isGroupHovered(at: index), isSelected: data.isSelected,
                    onHover: { setHover(at: index, hovering: $0) },
                    onTap: { gutterTap(data: data) },
                    onToggle: { setLine(data.diffLineNumber, $0) },
                    onDragChanged: { self.dragChanged(row: index, localY: $0) },
                    onDragEnded: { commitDrag() })
                diffContent(content: data.content, changedRange: data.changedRange, type: type, prefix: prefix, noNewline: data.noNewLineIndicator)
            }
        }
        .frame(height: Self.rowHeight)
        .background(groupHoverBackground(at: index))
        .contextMenu { rowMenus(forRow: index) }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(label): \(data.content)")
    }

    func diffContent(
        content: String, changedRange: Range<Int>?,
        type: DiffRowType, prefix: String = " ", noNewline: Bool = false
    ) -> some View {
        let palette = DiffRowPalette.palette(for: type, scheme: colorScheme)
        return HStack(spacing: 0) {
            Text(prefix)
                .foregroundStyle(.secondary)
                .frame(width: 16)
            DiffSyntaxHighlight.styledText(
                content: content.isEmpty ? " " : content,
                path: file.path,
                changedRange: changedRange,
                changeColor: palette.changedBackground,
                scheme: colorScheme)
            .lineLimit(1)
            if noNewline {
                Text(" No newline at end of file")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
        }
        .font(.system(size: 12, design: .monospaced))
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(palette.background)
        .textSelection(.enabled)
    }

    /// Check-all control for the first row of a changed group.
    func hunkHandle(at index: Int) -> some View {
        let row = rows[index]
        guard isInteractive,
              row.isChanged,
              let start = row.hunkStartLine,
              index == 0 || rows[index - 1].hunkStartLine != start
        else {
            return AnyView(Color.clear.frame(width: isInteractive ? 14 : 0))
        }
        let state = groupSelectionState(hunkStartLine: start)
        let symbol: String = {
            switch state {
            case .all: return "checkmark.square.fill"
            case .partial: return "minus.square.fill"
            case .none: return "square"
            }
        }()
        let hovered = hoveredGroup == start
        return AnyView(
            Button {
                toggleGroup(hunkStartLine: start, current: state)
            } label: {
                Image(systemName: symbol)
                    .font(.system(size: 11))
                    .foregroundColor(state == .none ? .secondary : .accentColor)
                    .opacity(showCheckMarks || hovered ? 1 : 0)
                    .frame(width: 14, height: Self.rowHeight)
            }
            .buttonStyle(.plain)
            .help("Toggle all lines in this hunk")
            .onHover { setHover(hunkStartLine: start, hovering: $0) }
            .contextMenu {
                if let range = DiffRowModel.findInteractiveOriginalDiffRange(
                    hunks: currentDiff.hunks, index: start),
                   onDiscardChanges != nil {
                    Button(DiffRowModel.discardLabel(
                        rangeType: range.type,
                        lineCount: range.lineCount,
                        askForConfirmation: askForConfirmationOnDiscard)) {
                        discardRange(range)
                    }
                }
            })
    }

    func groupHoverBackground(at index: Int) -> Color {
        guard let start = rows[index].hunkStartLine, hoveredGroup == start else {
            return .clear
        }
        return Color.accentColor.opacity(0.12)
    }

    // MARK: Context menus

    @ViewBuilder
    func rowMenus(forRow index: Int) -> some View {
        let row = rows[index]
        Button("Copy") {
            copyRowContent(at: index)
        }
        if isInteractive {
            Button("Select All") {
                if let selection {
                    onIncludeChanged?(selection.withSelectAll())
                }
            }
        }
        if isInteractive, onDiscardChanges != nil,
           let lineNumber = interactiveLineNumber(for: row),
           let range = DiffRowModel.findInteractiveOriginalDiffRange(
            hunks: currentDiff.hunks, index: lineNumber) {
            Divider()
            Button(DiffRowModel.discardLabel(
                rangeType: range.type, lineCount: 1,
                askForConfirmation: askForConfirmationOnDiscard)) {
                discardRange(DiffRange(from: lineNumber, to: lineNumber, type: range.type))
            }
            if range.lineCount > 1 {
                Button(DiffRowModel.discardLabel(
                    rangeType: range.type, lineCount: range.lineCount,
                    askForConfirmation: askForConfirmationOnDiscard)) {
                    discardRange(range)
                }
            }
        }
        if canExpandHunks {
            Divider()
            if wholeFileBackup == nil {
                Button("Expand Whole File") { expandWholeFile() }
            } else {
                Button("Collapse Expanded Lines") { collapseExpansion() }
            }
        }
    }

    /// Current-diff line number identifying `row` for range lookup.
    func interactiveLineNumber(for row: DiffRow) -> Int? {
        switch row {
        case .added(let data, let start): return data.diffLineNumber ?? start
        case .deleted(let data, let start): return data.diffLineNumber ?? start
        case .modified(_, _, let start): return start
        case .context, .hunk: return nil
        }
    }
}

// MARK: - Selection / discard / expansion

private extension TextDiffView {
    func setHover(at index: Int, hovering: Bool) {
        setHover(hunkStartLine: rows[index].hunkStartLine, hovering: hovering)
    }

    func setHover(hunkStartLine: Int?, hovering: Bool) {
        guard let start = hunkStartLine, isInteractive else {
            if !hovering { hoveredGroup = nil }
            return
        }
        hoveredGroup = hovering ? start : (hoveredGroup == start ? nil : hoveredGroup)
    }

    func isGroupHovered(at index: Int) -> Bool {
        guard let start = rows[index].hunkStartLine else { return false }
        return hoveredGroup == start
    }

    func gutterTap(data: DiffRowData) {
        guard isInteractive else { return }
        if hideWhitespace {
            showWhitespaceHint = true
            return
        }
        setLine(data.diffLineNumber, !data.isSelected)
    }

    func setLine(_ diffLineNumber: Int?, _ selected: Bool) {
        guard isInteractive, let selection, let n = diffLineNumber, n >= 0 else {
            if isInteractive && hideWhitespace { showWhitespaceHint = true }
            return
        }
        if hideWhitespace {
            showWhitespaceHint = true
            return
        }
        onIncludeChanged?(selection.withLineSelection(lineIndex: n, selected: selected))
    }

    func groupSelectionState(hunkStartLine: Int) -> DiffSelectionType {
        guard let selection,
              let range = DiffRowModel.findInteractiveOriginalDiffRange(
                hunks: currentDiff.hunks, index: hunkStartLine)
        else { return .none }
        return selection.isRangeSelected(from: range.from, length: range.lineCount)
    }

    func toggleGroup(hunkStartLine: Int, current: DiffSelectionType) {
        guard isInteractive, let selection else { return }
        if hideWhitespace {
            showWhitespaceHint = true
            return
        }
        guard let range = DiffRowModel.findInteractiveOriginalDiffRange(
            hunks: currentDiff.hunks, index: hunkStartLine)
        else { return }
        onIncludeChanged?(selection.withRangeSelection(
            from: range.from, length: range.lineCount,
            selected: current != .all))
    }

    func discardRange(_ range: DiffRange) {
        guard let onDiscardChanges else { return }
        let target = DiffSelection.none.withRangeSelection(
            from: range.from, length: range.lineCount, selected: true)
        onDiscardChanges(target)
    }

    func copyRowContent(at index: Int) {
        let text: String = {
            switch rows[index] {
            case .context(let content, _, _): return content
            case .hunk(let content, _, _): return content
            case .added(let data, _): return data.content
            case .deleted(let data, _): return data.content
            case .modified(let before, let after, _): return "\(before.content)\n\(after.content)"
            }
        }()
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(text, forType: .string)
    }

    // MARK: Gutter drag-select

    /// Absolute Y (in row coordinates) of a gutter-drag event.
    func dragChanged(row: Int, localY: Double) {
        guard isInteractive, !hideWhitespace else { return }
        let absY = Double(row) * Self.rowHeight + localY
        let target = max(0, min(rows.count - 1, Int(absY / Self.rowHeight)))
        if dragFromRow == nil {
            dragFromRow = row
            // Dragging selects or deselects based on the anchor line's state.
            if let line = anchorLine(at: row), let selection {
                dragSelects = !selection.isSelected(lineIndex: line)
            } else {
                dragSelects = true
            }
        }
        dragToRow = target
    }

    func commitDrag() {
        guard let from = dragFromRow, let to = dragToRow,
              let selection, isInteractive
        else {
            dragFromRow = nil
            dragToRow = nil
            return
        }
        var updated = selection
        for line in dragLines(fromRow: from, toRow: to) {
            updated = updated.withLineSelection(lineIndex: line, selected: dragSelects)
        }
        dragFromRow = nil
        dragToRow = nil
        onIncludeChanged?(updated)
    }

    func anchorLine(at row: Int) -> Int? {
        guard rows.indices.contains(row) else { return nil }
        switch rows[row] {
        case .added(let data, _): return data.diffLineNumber
        case .deleted(let data, _): return data.diffLineNumber
        case .modified(let before, _, _): return before.diffLineNumber
        case .context, .hunk: return nil
        }
    }

    /// Includeable original-diff line numbers between two rows (inclusive).
    func dragLines(fromRow: Int, toRow: Int) -> [Int] {
        let lo = min(fromRow, toRow)
        let hi = max(fromRow, toRow)
        var lines: [Int] = []
        for index in lo...hi where rows.indices.contains(index) {
            switch rows[index] {
            case .added(let data, _): if let n = data.diffLineNumber { lines.append(n) }
            case .deleted(let data, _): if let n = data.diffLineNumber { lines.append(n) }
            case .modified(let before, let after, _):
                if let n = before.diffLineNumber { lines.append(n) }
                if let n = after.diffLineNumber, n != before.diffLineNumber { lines.append(n) }
            case .context, .hunk: break
            }
        }
        return lines
    }

    // MARK: Expansion

    func expandHunk(at hunkIndex: Int, kind: DiffExpansionKind) {
        guard canExpandHunks, let contents = fileContents else { return }
        guard let next = DiffExpansion.expandHunk(
            currentDiff, hunkIndex: hunkIndex, kind: kind,
            newContentLines: contents.newLines)
        else { return }
        displayDiff = next
    }

    func expandWholeFile() {
        guard canExpandHunks, let contents = fileContents else { return }
        guard let next = DiffExpansion.expandWhole(currentDiff, newContentLines: contents.newLines) else { return }
        wholeFileBackup = currentDiff
        displayDiff = next
    }

    func collapseExpansion() {
        if let backup = wholeFileBackup {
            displayDiff = backup.text == preparedBase.text ? nil : backup
            wholeFileBackup = nil
        } else {
            displayDiff = nil
        }
    }

    func resetExpansion() {
        displayDiff = nil
        wholeFileBackup = nil
    }

    // MARK: Search

    func runSearch(query: String) {
        let hits = DiffSearch.findHits(rows: rows, query: query, showSideBySide: showSideBySide)
        search.commit(query: query, hits: hits)
    }

    func stepSearch(_ direction: DiffSearchState.StepDirection) {
        if search.query != searchFieldText {
            runSearch(query: searchFieldText)
        } else {
            search.step(direction)
        }
    }
}

// MARK: - HunkRowView

/// `@@` header with expand-up/down/all controls. Port of the hunk header
/// rendering in `side-by-side-diff-row.tsx`.
struct HunkRowView: View {
    let content: String
    let expansionType: DiffHunkExpansionType
    let hunkIndex: Int
    let canExpand: Bool
    var onExpandUp: () -> Void
    var onExpandDown: () -> Void
    var onExpandAll: () -> Void
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        let palette = DiffRowPalette.palette(for: .hunk, scheme: colorScheme)
        HStack(spacing: 2) {
            if canExpand {
                switch expansionType {
                case .up:
                    expandButton(title: "Expand Up", symbol: "chevron.up", action: onExpandUp)
                case .down:
                    expandButton(title: "Expand Down", symbol: "chevron.down", action: onExpandDown)
                case .both:
                    expandButton(title: "Expand Down", symbol: "chevron.down", action: onExpandDown)
                    expandButton(title: "Expand Up", symbol: "chevron.up", action: onExpandUp)
                case .short:
                    expandButton(title: "Expand All", symbol: "chevron.up.chevron.down", action: onExpandAll)
                case .none:
                    Color.clear.frame(width: 18)
                }
            }
            Text(content)
                .font(.system(size: 12, design: .monospaced))
                .foregroundStyle(.secondary)
                .lineLimit(1)
            Spacer(minLength: 0)
        }
        .background(palette.background)
    }

    private func expandButton(title: String, symbol: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 10, weight: .bold))
                .frame(width: 18, height: 20)
        }
        .buttonStyle(.plain)
        .foregroundColor(.accentColor)
        .help(title)
        .accessibilityLabel(title)
    }
}

// MARK: - DiffGutterView

/// Line-number gutter with checkbox, tap toggle, and drag-select.
/// Port of the gutter half of `side-by-side-diff-row.tsx`.
struct DiffGutterView: View {
    /// One number per displayed column (unified context shows both).
    let numbers: [Int?]
    let column: DiffColumn
    let width: Double
    let data: DiffRowData?
    let interactive: Bool
    let showCheckMarks: Bool
    let isHovered: Bool
    let isSelected: Bool
    var onHover: (Bool) -> Void
    var onTap: () -> Void
    var onToggle: (Bool) -> Void
    var onDragChanged: (Double) -> Void
    var onDragEnded: () -> Void

    var body: some View {
        HStack(spacing: 2) {
            if interactive && showCheckMarks, let data {
                Toggle("", isOn: Binding(
                    get: { data.isSelected },
                    set: { onToggle($0) }))
                .toggleStyle(.checkbox)
                .controlSize(.mini)
                .labelsHidden()
                .accessibilityLabel("Include line \(data.lineNumber)")
            }
            ForEach(numbers.indices, id: \.self) { i in
                if let n = numbers[i] {
                    Text("\(n)")
                        .frame(maxWidth: .infinity, alignment: .trailing)
                } else {
                    Text(" ")
                        .frame(maxWidth: .infinity)
                }
            }
        }
        .font(.system(size: 11, design: .monospaced))
        .foregroundStyle(.secondary)
        .frame(width: width - (interactive ? 14 : 0), height: 20)
        .background(
            isSelected
                ? Color.accentColor.opacity(0.25)
                : isHovered ? Color.accentColor.opacity(0.12) : Color(nsColor: .controlBackgroundColor))
        .contentShape(Rectangle())
        .onTapGesture { onTap() }
        .gesture(
            DragGesture(minimumDistance: 2)
                .onChanged { value in
                    onDragChanged(Double(value.location.y))
                }
                .onEnded { _ in onDragEnded() })
        .onHover(perform: onHover)
        .accessibilityElement(children: .combine)
    }
}

// MARK: - DiffSearchBar

/// Find bar. Port of `diff-search-input.tsx` + the result-count live region.
struct DiffSearchBar: View {
    @Binding var query: String
    let message: String
    var onNext: () -> Void
    var onPrevious: () -> Void
    var onCommit: () -> Void
    var onClose: () -> Void
    @FocusState private var focused: Bool

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(.secondary)
            TextField("Search…", text: $query, onCommit: onCommit)
                .textFieldStyle(.roundedBorder)
                .focused($focused)
                .onAppear { focused = true }
                .onKeyPress(.escape) {
                    onClose()
                    return .handled
                }
            if !message.isEmpty {
                Text(message)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .accessibilityAddTraits(.updatesFrequently)
            }
            Button { onPrevious() } label: {
                Image(systemName: "chevron.up")
            }
            .help("Previous match (Shift+Enter)")
            Button { onNext() } label: {
                Image(systemName: "chevron.down")
            }
            .help("Next match (Enter)")
            Button { onClose() } label: {
                Image(systemName: "xmark")
            }
            .help("Close search (Esc)")
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(Color(nsColor: .controlBackgroundColor))
    }
}

#Preview {
    TextDiffView(
        file: DiffFileDescriptor(
            path: "Sources/App.swift",
            status: .modified(submoduleStatus: nil),
            isSelectable: true),
        diff: DiffFixtures.smallTextDiff(),
        fileContents: DiffFileContents(
            oldLines: ["context", "old line", "tail"],
            newLines: ["context", "new line", "added line", "tail"]),
        selection: .fromInitialSelection(.all),
        onIncludeChanged: { _ in },
        onDiscardChanges: { _ in },
        onHideWhitespaceChanged: { _ in })
    .frame(width: 640, height: 300)
}
