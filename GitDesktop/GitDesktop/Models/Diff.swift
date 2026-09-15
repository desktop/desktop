import Foundation

// MARK: - Diff types
// Direct port of `electron/app/src/models/diff/*`.
// `Image` is renamed to `DiffImage` to avoid colliding with SwiftUI.Image.

/// Largest diff string the app will hold (V8 string limit in the original).
public let maximumDiffStringSize = 268_435_441
/// Buffer cap for diff output (70 MB). See Docs/09-git-layer.md.
public let maxDiffBufferSize: Int = 70_000_000
/// Threshold above which a text diff is treated as LargeText.
public let maxReasonableDiffSize: Int = 70_000_000 / 16
/// Lines longer than this make a diff unrenderable as text.
public let maxCharactersPerLine = 5_000

public enum DiffType: Int, Codable, Sendable {
    case text
    case image
    case binary
    case submodule
    case largeText
    case unrenderable
}

public enum LineEnding: String, Codable, Sendable {
    case cr = "CR"
    case lf = "LF"
    case crlf = "CRLF"
}

public struct LineEndingsChange: Codable, Sendable, Equatable {
    public var from: LineEnding
    public var to: LineEnding

    public init(from: LineEnding, to: LineEnding) {
        self.from = from
        self.to = to
    }
}

public func parseLineEndingText(_ text: String) -> LineEnding? {
    switch text.trimmingCharacters(in: .whitespaces) {
    case "CR": return .cr
    case "LF": return .lf
    case "CRLF": return .crlf
    default: return nil
    }
}

// MARK: - Diff lines / hunks

/// What a line in a diff represents. Port of `DiffLineType`.
public enum DiffLineType: Int, Codable, Sendable {
    case context
    case add
    case delete
    case hunk
}

/// One line of a unified diff. Port of `DiffLine`.
public struct DiffLine: Sendable, Equatable {
    public var text: String
    public var type: DiffLineType
    /// Line number in the original patch, or nil if added by hunk expansion.
    public var originalLineNumber: Int?
    public var oldLineNumber: Int?
    public var newLineNumber: Int?
    public var noTrailingNewLine: Bool

    public init(
        text: String,
        type: DiffLineType,
        originalLineNumber: Int?,
        oldLineNumber: Int?,
        newLineNumber: Int?,
        noTrailingNewLine: Bool = false
    ) {
        self.text = text
        self.type = type
        self.originalLineNumber = originalLineNumber
        self.oldLineNumber = oldLineNumber
        self.newLineNumber = newLineNumber
        self.noTrailingNewLine = noTrailingNewLine
    }

    public func withNoTrailingNewLine(_ value: Bool) -> DiffLine {
        DiffLine(
            text: text, type: type,
            originalLineNumber: originalLineNumber,
            oldLineNumber: oldLineNumber, newLineNumber: newLineNumber,
            noTrailingNewLine: value)
    }

    public var isIncludeableLine: Bool {
        type == .add || type == .delete
    }

    /// Line content without the leading `+`/`-`/` `/`@@` marker.
    public var content: String {
        guard !text.isEmpty else { return text }
        return String(text.dropFirst())
    }
}

/// `@@ -l,s +l,s @@` header. Port of `DiffHunkHeader`.
public struct DiffHunkHeader: Sendable, Equatable {
    public var oldStartLine: Int
    public var oldLineCount: Int
    public var newStartLine: Int
    public var newLineCount: Int

    public init(oldStartLine: Int, oldLineCount: Int, newStartLine: Int, newLineCount: Int) {
        self.oldStartLine = oldStartLine
        self.oldLineCount = oldLineCount
        self.newStartLine = newStartLine
        self.newLineCount = newLineCount
    }

    public func toDiffLineRepresentation() -> String {
        "@@ -\(oldStartLine),\(oldLineCount) +\(newStartLine),\(newLineCount) @@"
    }
}

public enum DiffHunkExpansionType: String, Codable, Sendable {
    case none = "None"
    case up = "Up"
    case down = "Down"
    case both = "Both"
    case short = "Short"
}

/// One hunk of a unified diff. Port of `DiffHunk`.
public struct DiffHunk: Sendable, Equatable {
    public var header: DiffHunkHeader
    public var lines: [DiffLine]
    public var unifiedDiffStart: Int
    public var unifiedDiffEnd: Int
    public var expansionType: DiffHunkExpansionType

    public init(
        header: DiffHunkHeader,
        lines: [DiffLine],
        unifiedDiffStart: Int,
        unifiedDiffEnd: Int,
        expansionType: DiffHunkExpansionType = .none
    ) {
        self.header = header
        self.lines = lines
        self.unifiedDiffStart = unifiedDiffStart
        self.unifiedDiffEnd = unifiedDiffEnd
        self.expansionType = expansionType
    }
}

/// Raw parsed diff before classification. Port of `IRawDiff`.
public struct RawDiff: Sendable, Equatable {
    public var header: String
    public var contents: String
    public var hunks: [DiffHunk]
    public var isBinary: Bool
    public var maxLineNumber: Int
    public var hasHiddenBidiChars: Bool

    public init(
        header: String,
        contents: String,
        hunks: [DiffHunk],
        isBinary: Bool,
        maxLineNumber: Int,
        hasHiddenBidiChars: Bool
    ) {
        self.header = header
        self.contents = contents
        self.hunks = hunks
        self.isBinary = isBinary
        self.maxLineNumber = maxLineNumber
        self.hasHiddenBidiChars = hasHiddenBidiChars
    }
}

// MARK: - Diff selection

/// Overall selection state of a file. Port of `DiffSelectionType`.
public enum DiffSelectionType: String, Codable, Sendable {
    case all = "All"
    case partial = "Partial"
    case none = "None"
}

/// Immutable selection of indexable diff lines.
/// Port of `DiffSelection` in `models/diff/diff-selection.ts`.
public struct DiffSelection: Sendable, Equatable {
    public enum InitialSelection {
        case all
        case none
    }

    private var defaultSelectionType: DiffSelectionType
    private var divergingLines: Set<Int>?
    private var selectableLines: Set<Int>?

    public static func fromInitialSelection(_ initial: InitialSelection) -> DiffSelection {
        switch initial {
        case .all: return DiffSelection(defaultSelectionType: .all)
        case .none: return DiffSelection(defaultSelectionType: .none)
        }
    }

    public static var all: DiffSelection { fromInitialSelection(.all) }
    public static var none: DiffSelection { fromInitialSelection(.none) }

    private init(
        defaultSelectionType: DiffSelectionType,
        divergingLines: Set<Int>? = nil,
        selectableLines: Set<Int>? = nil
    ) {
        self.defaultSelectionType = defaultSelectionType
        self.divergingLines = divergingLines
        self.selectableLines = selectableLines
    }

    public func getSelectionType() -> DiffSelectionType {
        guard let diverging = divergingLines, !diverging.isEmpty else {
            return defaultSelectionType
        }
        if let selectable = selectableLines,
           selectable.count == diverging.count,
           selectable.allSatisfy({ diverging.contains($0) }) {
            return defaultSelectionType == .all ? .none : .all
        }
        return .partial
    }

    public func isSelected(lineIndex: Int) -> Bool {
        let divergent = divergingLines?.contains(lineIndex) ?? false
        switch defaultSelectionType {
        case .all: return !divergent
        case .none: return divergent
        case .partial: return !divergent
        }
    }

    public func isRangeSelected(from: Int, length: Int) -> DiffSelectionType {
        guard length > 0 else { return .none }
        let computed = getSelectionType()
        guard computed == .partial else { return computed }
        if length == 1 { return isSelected(lineIndex: from) ? .all : .none }
        var foundSelected = false
        var foundDeselected = false
        for i in from..<(from + length) {
            if isSelected(lineIndex: i) { foundSelected = true }
            else { foundDeselected = true }
            if foundSelected && foundDeselected { return .partial }
        }
        if foundSelected { return .all }
        return .none
    }

    public func isSelectable(lineIndex: Int) -> Bool {
        selectableLines?.contains(lineIndex) ?? true
    }

    public func withLineSelection(lineIndex: Int, selected: Bool) -> DiffSelection {
        var diverging = divergingLines ?? Set<Int>()
        let currentlySelected = isSelected(lineIndex: lineIndex)
        if selected == currentlySelected { return self }
        if diverging.contains(lineIndex) { diverging.remove(lineIndex) }
        else { diverging.insert(lineIndex) }
        return DiffSelection(
            defaultSelectionType: defaultSelectionType,
            divergingLines: diverging,
            selectableLines: selectableLines)
    }

    public func withRangeSelection(from: Int, length: Int, selected: Bool) -> DiffSelection {
        var copy = self
        for i in from..<(from + length) {
            copy = copy.withLineSelection(lineIndex: i, selected: selected)
        }
        return copy
    }

    public func withToggleLineSelection(lineIndex: Int) -> DiffSelection {
        withLineSelection(lineIndex: lineIndex, selected: !isSelected(lineIndex: lineIndex))
    }

    public func withSelectAll() -> DiffSelection {
        DiffSelection(
            defaultSelectionType: .all,
            divergingLines: Set<Int>(),
            selectableLines: selectableLines)
    }

    public func withSelectNone() -> DiffSelection {
        DiffSelection(
            defaultSelectionType: .none,
            divergingLines: Set<Int>(),
            selectableLines: selectableLines)
    }

    public func withSelectableLines(_ lines: Set<Int>) -> DiffSelection {
        DiffSelection(
            defaultSelectionType: defaultSelectionType,
            divergingLines: divergingLines,
            selectableLines: lines)
    }
}

// MARK: - Image diffs

/// Raw image bytes for image diffs. Renamed from TS `Image`.
public struct DiffImage: Sendable, Equatable {
    public var base64Contents: String
    public var mediaType: String
    public var bytes: Int

    public init(base64Contents: String, mediaType: String, bytes: Int) {
        self.base64Contents = base64Contents
        self.mediaType = mediaType
        self.bytes = bytes
    }
}

public enum ImageDiffType: Int, Codable, Sendable {
    case twoUp
    case swipe
    case onionSkin
    case difference
}

// MARK: - Diff union

/// Text diff payload shared by `.text` and `.largeText`.
public struct TextDiffData: Sendable, Equatable {
    public var text: String
    public var hunks: [DiffHunk]
    public var lineEndingsChange: LineEndingsChange?
    public var maxLineNumber: Int
    public var hasHiddenBidiChars: Bool

    public init(
        text: String,
        hunks: [DiffHunk],
        lineEndingsChange: LineEndingsChange? = nil,
        maxLineNumber: Int,
        hasHiddenBidiChars: Bool
    ) {
        self.text = text
        self.hunks = hunks
        self.lineEndingsChange = lineEndingsChange
        self.maxLineNumber = maxLineNumber
        self.hasHiddenBidiChars = hasHiddenBidiChars
    }
}

public struct SubmoduleDiffData: Sendable, Equatable {
    public var fullPath: String
    public var path: String
    public var url: String?
    public var status: SubmoduleStatus
    public var oldSHA: String?
    public var newSHA: String?

    public init(
        fullPath: String,
        path: String,
        url: String?,
        status: SubmoduleStatus,
        oldSHA: String?,
        newSHA: String?
    ) {
        self.fullPath = fullPath
        self.path = path
        self.url = url
        self.status = status
        self.oldSHA = oldSHA
        self.newSHA = newSHA
    }
}

/// Renderable diff. Port of `IDiff`.
public enum Diff: Sendable, Equatable {
    case text(TextDiffData)
    case image(previous: DiffImage?, current: DiffImage?)
    case binary
    case submodule(SubmoduleDiffData)
    case largeText(TextDiffData)
    case unrenderable

    public var type: DiffType {
        switch self {
        case .text: return .text
        case .image: return .image
        case .binary: return .binary
        case .submodule: return .submodule
        case .largeText: return .largeText
        case .unrenderable: return .unrenderable
        }
    }
}
