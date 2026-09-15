import SwiftUI

// MARK: - DiffSyntaxHighlight
// Lightweight syntax tokenizer + diff color theme. The reference app uses
// async CodeMirror modes; the spec maps that to "TextKit2/Splash, token
// colors per spec" with no third-party deps (Task 10). This file provides a
// dependency-free regex scanner with the exact token colors from
// `GitDesktop/Docs/03-design-system.md` §12, plus the diff row palette.

// MARK: Token colors (Docs/03 §12)

/// Syntax token kinds with the spec's light/dark hex pairs.
public enum DiffTokenKind: Sendable, Equatable {
    case keyword  // #d73a49
    case string   // #032f62
    case comment  // gray-500
    case number   // atom #005cc5
    case tag      // #22863a
    case variable // #6f42c1

    func color(for scheme: ColorScheme) -> Color {
        switch (self, scheme) {
        case (.keyword, .light): return Color(red: 0xD7 / 255, green: 0x3A / 255, blue: 0x49 / 255)
        case (.keyword, .dark): return Color(red: 1.0, green: 0x7B / 255, blue: 0x72 / 255)
        case (.string, .light): return Color(red: 0x03 / 255, green: 0x2F / 255, blue: 0x62 / 255)
        case (.string, .dark): return Color(red: 0xA5 / 255, green: 0xD6 / 255, blue: 0xFF / 255)
        case (.comment, _): return .secondary
        case (.number, .light): return Color(red: 0x00 / 255, green: 0x5C / 255, blue: 0xC5 / 255)
        case (.number, .dark): return Color(red: 0x79 / 255, green: 0xC0 / 255, blue: 0xFF / 255)
        case (.tag, .light): return Color(red: 0x22 / 255, green: 0x86 / 255, blue: 0x3A / 255)
        case (.tag, .dark): return Color(red: 0x7E / 255, green: 0xE7 / 255, blue: 0x8C / 255)
        case (.variable, .light): return Color(red: 0x6F / 255, green: 0x42 / 255, blue: 0xC1 / 255)
        case (.variable, .dark): return Color(red: 0xD2 / 255, green: 0xA8 / 255, blue: 0xFF / 255)
        @unknown default: return .primary
        }
    }
}

// MARK: Row palette (Docs/03 §12)

/// Diff row background/border colors per color scheme.
public struct DiffRowPalette: Sendable, Equatable {
    public var background: Color
    public var gutterBackground: Color
    public var changedBackground: Color

    public static func palette(for type: DiffRowType, scheme: ColorScheme) -> DiffRowPalette {
        let light = scheme != .dark
        switch type {
        case .added, .modified:
            return DiffRowPalette(
                background: light
                    ? Color(red: 0xE6 / 255, green: 0xFF / 255, blue: 0xEC / 255)
                    : Color(red: 0x0D / 255, green: 0x2B / 255, blue: 0x1A / 255),
                gutterBackground: light
                    ? Color(red: 0xAC / 255, green: 0xF2 / 255, blue: 0xBD / 255)
                    : Color(red: 0x1A / 255, green: 0x5C / 255, blue: 0x2E / 255),
                changedBackground: light
                    ? Color(red: 0xAC / 255, green: 0xF2 / 255, blue: 0xBD / 255)
                    : Color(red: 0x1F / 255, green: 0x6F / 255, blue: 0x37 / 255))
        case .deleted:
            return DiffRowPalette(
                background: light
                    ? Color(red: 0xFF / 255, green: 0xEE / 255, blue: 0xF0 / 255)
                    : Color(red: 0x33 / 255, green: 0x0D / 255, blue: 0x12 / 255),
                gutterBackground: light
                    ? Color(red: 0xFD / 255, green: 0xB8 / 255, blue: 0xC0 / 255)
                    : Color(red: 0x6E / 255, green: 0x1E / 255, blue: 0x26 / 255),
                changedBackground: light
                    ? Color(red: 0xFD / 255, green: 0xB8 / 255, blue: 0xC0 / 255)
                    : Color(red: 0x7A / 255, green: 0x2A / 255, blue: 0x33 / 255))
        case .hunk:
            return DiffRowPalette(
                background: light
                    ? Color(red: 0xF1 / 255, green: 0xF8 / 255, blue: 0xFF / 255)
                    : Color(red: 0x0D / 255, green: 0x1B / 255, blue: 0x2E / 255),
                gutterBackground: light
                    ? Color(red: 0xDB / 255, green: 0xED / 255, blue: 0xFF / 255)
                    : Color(red: 0x1C / 255, green: 0x3A / 255, blue: 0x5E / 255),
                changedBackground: .clear)
        case .context:
            return DiffRowPalette(
                background: .clear,
                gutterBackground: .clear,
                changedBackground: .clear)
        }
    }
}

// MARK: Language detection + tokenizer

public enum DiffLanguage: Sendable, Equatable {
    case cLike
    case script
    case markup
    case plain
}

public enum DiffSyntaxHighlight {
    public static func language(forPath path: String) -> DiffLanguage {
        let ext = (path as NSString).pathExtension.lowercased()
        switch ext {
        case "c", "h", "cc", "cpp", "hpp", "m", "mm", "cs", "java", "go",
             "rs", "js", "jsx", "ts", "tsx", "swift", "kt", "scala", "php":
            return .cLike
        case "py", "rb", "sh", "bash", "zsh", "pl", "lua", "yml", "yaml",
             "toml", "ini", "cfg", "json", "css", "scss", "less", "sql", "md", "dockerfile":
            return .script
        case "html", "htm", "xml", "xhtml", "vue", "svelte", "plist", "storyboard", "xib":
            return .markup
        default:
            return .plain
        }
    }

    /// Tokenize one line into character-offset ranges. Priority: comment >
    /// string > number/keyword/tag. Pure and unit-testable.
    public static func tokenize(_ line: String, language: DiffLanguage) -> [(range: Range<Int>, kind: DiffTokenKind)] {
        guard language != .plain, !line.isEmpty else { return [] }
        let chars = Array(line)
        var spans: [(range: Range<Int>, kind: DiffTokenKind)] = []
        var i = 0

        func starts(_ s: String, at index: Int) -> Bool {
            guard index + s.count <= chars.count else { return false }
            return String(chars[index..<(index + s.count)]) == s
        }

        // Line comments: // (cLike), # (script), <!-- (markup).
        let lineComment: String? = {
            switch language {
            case .cLike: return "//"
            case .script: return "#"
            case .markup: return nil
            case .plain: return nil
            }
        }()
        if let marker = lineComment, let range = line.range(of: marker) {
            // Only treat as comment when not inside a string before it.
            let prefix = String(line[..<range.lowerBound])
            if !prefix.contains("\"") && !prefix.contains("'") && !prefix.contains("`") {
                let start = line.distance(from: line.startIndex, to: range.lowerBound)
                spans.append((start..<chars.count, .comment))
                return spans
            }
        }
        if language == .markup, let range = line.range(of: "<!--") {
            let start = line.distance(from: line.startIndex, to: range.lowerBound)
            spans.append((start..<chars.count, .comment))
            return spans
        }

        while i < chars.count {
            let c = chars[i]
            // Strings.
            if c == "\"" || c == "'" || c == "`" {
                var j = i + 1
                while j < chars.count {
                    if chars[j] == "\\" { j += 2; continue }
                    if chars[j] == c { j += 1; break }
                    j += 1
                }
                spans.append((i..<min(j, chars.count), .string))
                i = j
                continue
            }
            // Numbers.
            if c.isNumber && (i == 0 || (!chars[i - 1].isLetter && chars[i - 1] != "_")) {
                var j = i
                while j < chars.count && (chars[j].isNumber || chars[j] == "." || chars[j] == "x" || (chars[j].isLetter && chars[j].isHexDigit)) {
                    j += 1
                }
                spans.append((i..<j, .number))
                i = j
                continue
            }
            // Words: keywords or markup tags.
            if c.isLetter || c == "_" || c == "@" || (language == .markup && c == "<") {
                var j = i
                if language == .markup && c == "<" {
                    j += 1
                    if j < chars.count && chars[j] == "/" { j += 1 }
                    while j < chars.count && (chars[j].isLetter || chars[j].isNumber || chars[j] == "-" || chars[j] == "_" || chars[j] == ":") {
                        j += 1
                    }
                    spans.append((i..<j, .tag))
                    i = j
                    continue
                }
                let wordStart = (c == "@") ? i + 1 : i
                j = wordStart
                while j < chars.count && (chars[j].isLetter || chars[j].isNumber || chars[j] == "_" || chars[j] == "?" || chars[j] == "!") {
                    j += 1
                }
                let word = String(chars[wordStart..<j])
                if keywords.contains(word) {
                    spans.append((i..<j, .keyword))
                }
                i = j
                continue
            }
            i += 1
        }
        return spans
    }

    /// Render a diff line as styled `Text`, layering syntax tokens with an
    /// optional intra-line change background.
    public static func styledText(
        content: String,
        path: String,
        changedRange: Range<Int>?,
        changeColor: Color,
        scheme: ColorScheme
    ) -> Text {
        let source = content.isEmpty ? " " : content
        var attributed = AttributedString(source)
        let language = language(forPath: path)
        for span in tokenize(source, language: language) {
            guard let range = stringRange(span.range, in: source),
                  let attrRange = Range(range, in: attributed) else { continue }
            attributed[attrRange].foregroundColor = span.kind.color(for: scheme)
        }
        if let changedRange, !changedRange.isEmpty,
           let range = stringRange(changedRange, in: source),
           let attrRange = Range(range, in: attributed) {
            attributed[attrRange].backgroundColor = changeColor
        }
        return Text(attributed)
    }

    /// Clamp integer character offsets to a valid `String.Index` range.
    private static func stringRange(_ range: Range<Int>, in source: String) -> Range<String.Index>? {
        let count = source.count
        let lo = max(0, min(range.lowerBound, count))
        let hi = max(0, min(range.upperBound, count))
        guard lo <= hi else { return nil }
        let lower = source.index(source.startIndex, offsetBy: lo)
        let upper = source.index(lower, offsetBy: hi - lo)
        return lower..<upper
    }

    private static let keywords: Set<String> = [
        "func", "class", "struct", "enum", "protocol", "extension", "import",
        "let", "var", "const", "return", "if", "else", "for", "while", "do",
        "switch", "case", "break", "continue", "guard", "defer", "in", "as",
        "is", "try", "catch", "throw", "throws", "await", "async", "new",
        "delete", "typeof", "instanceof", "void", "this", "self", "super",
        "nil", "null", "true", "false", "undefined", "static", "final",
        "public", "private", "protected", "internal", "open", "override",
        "mutating", "nonmutating", "required", "optional", "lazy", "weak",
        "unowned", "inout", "where", "associatedtype", "typealias", "sizeof",
        "typedef", "namespace", "using", "template", "typename", "virtual",
        "explicit", "operator", "friend", "volatile", "constexpr", "decltype",
        "def", "end", "begin", "rescue", "ensure", "module", "yield", "lambda",
        "pass", "raise", "from", "with", "except", "finally", "global",
        "nonlocal", "assert", "del", "elif", "or", "and", "not", "package",
        "fn", "match", "impl", "trait", "mut", "ref", "move", "use", "mod",
        "crate", "extern", "union", "interface", "extends", "implements",
        "throws", "synchronized", "transient", "native", "strictfp", "enum",
        "echo", "fi", "then", "elif", "export", "local", "readonly", "shift",
        "select", "until", "function",
    ]
}
