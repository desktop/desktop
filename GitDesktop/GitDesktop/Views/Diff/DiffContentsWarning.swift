import SwiftUI

// MARK: - DiffContentsWarning
// Bidi / line-ending warnings above the diff. Port of
// `electron/app/src/ui/diff/diff-contents-warning.tsx`.
// The reference links out to GitHub docs; per scope (no GitHub
// integration) the messages are kept as plain text.

public struct DiffContentsWarning: View {
    let diff: TextDiffData

    public init(diff: TextDiffData) {
        self.diff = diff
    }

    public var body: some View {
        let items = warnings
        if !items.isEmpty {
            VStack(alignment: .leading, spacing: 4) {
                ForEach(items.indices, id: \.self) { index in
                    HStack(alignment: .top, spacing: 6) {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .foregroundStyle(.yellow)
                        Text(items[index])
                            .font(.system(size: 12))
                            .textSelection(.enabled)
                    }
                }
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
        }
    }

    private var warnings: [String] {
        var items: [String] = []
        if diff.hasHiddenBidiChars {
            items.append(
                "This diff contains bidirectional Unicode text that may be interpreted or compiled differently than what appears below. To review, open the file in an editor that reveals hidden Unicode characters.")
        }
        if let change = diff.lineEndingsChange {
            items.append(
                "This file uses '\(change.from.rawValue)' line endings, but Git is configured to convert them to '\(change.to.rawValue)' the next time the file is checked out.")
        }
        return items
    }
}

#Preview {
    DiffContentsWarning(diff: TextDiffData(
        text: "",
        hunks: [],
        lineEndingsChange: LineEndingsChange(from: .crlf, to: .lf),
        maxLineNumber: 0,
        hasHiddenBidiChars: true))
    .frame(width: 420)
}
