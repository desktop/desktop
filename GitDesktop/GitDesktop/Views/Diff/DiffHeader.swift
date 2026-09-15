import SwiftUI

// MARK: - DiffHeader
// File path + status + diff-settings gear. Port of
// `electron/app/src/ui/diff/diff-header.tsx` + `diff-options.tsx`.
// The options UI is hidden for submodule diffs (like the original).

public struct DiffHeader: View {
    let path: String
    let status: AppFileStatus
    let showOptions: Bool
    let hideWhitespace: Bool
    let showSideBySide: Bool
    var onHideWhitespaceChanged: ((Bool) -> Void)?
    var onShowSideBySideChanged: ((Bool) -> Void)?

    public init(
        path: String,
        status: AppFileStatus,
        showOptions: Bool = true,
        hideWhitespace: Bool = false,
        showSideBySide: Bool = false,
        onHideWhitespaceChanged: ((Bool) -> Void)? = nil,
        onShowSideBySideChanged: ((Bool) -> Void)? = nil
    ) {
        self.path = path
        self.status = status
        self.showOptions = showOptions
        self.hideWhitespace = hideWhitespace
        self.showSideBySide = showSideBySide
        self.onHideWhitespaceChanged = onHideWhitespaceChanged
        self.onShowSideBySideChanged = onShowSideBySideChanged
    }

    public var body: some View {
        HStack(spacing: 6) {
            Text(path)
                .font(.system(size: 12))
                .lineLimit(1)
                .truncationMode(.middle)
                .help(path)
            Spacer(minLength: 4)
            if showOptions {
                DiffOptionsButton(
                    hideWhitespace: hideWhitespace,
                    showSideBySide: showSideBySide,
                    onHideWhitespaceChanged: onHideWhitespaceChanged,
                    onShowSideBySideChanged: onShowSideBySideChanged)
            }
            FileStatusIcon(status: status)
        }
        .padding(.horizontal, 10)
        .frame(height: 30)
        .background(Color(nsColor: .controlBackgroundColor))
    }
}

// MARK: - FileStatusIcon

/// Status icon + tooltip. SF Symbols per Docs/03 octicon map.
public struct FileStatusIcon: View {
    let status: AppFileStatus

    public init(status: AppFileStatus) {
        self.status = status
    }

    public var body: some View {
        Image(systemName: symbol)
            .foregroundStyle(color)
            .font(.system(size: 12))
            .help(DiffSupport.statusLabel(for: status))
            .accessibilityLabel(DiffSupport.statusLabel(for: status))
    }

    private var symbol: String {
        switch status.kind {
        case .new: return "plus.circle.fill"
        case .modified: return "circle.fill"
        case .deleted: return "minus.circle.fill"
        case .copied: return "plus.square.on.square.fill"
        case .renamed: return "arrow.right.circle.fill"
        case .conflicted: return "exclamationmark.triangle.fill"
        case .untracked: return "questionmark.circle.fill"
        }
    }

    private var color: Color {
        switch status.kind {
        case .new: return .green
        case .modified: return .yellow
        case .deleted: return .red
        case .copied, .renamed: return .blue
        case .conflicted: return .orange
        case .untracked: return .secondary
        }
    }
}

// MARK: - DiffOptionsButton

/// Gear button + popover. Port of `DiffOptions`: whitespace fieldset +
/// Unified/Split radiogroup.
struct DiffOptionsButton: View {
    let hideWhitespace: Bool
    let showSideBySide: Bool
    var onHideWhitespaceChanged: ((Bool) -> Void)?
    var onShowSideBySideChanged: ((Bool) -> Void)?
    @State private var isOpen = false

    var body: some View {
        Button {
            isOpen.toggle()
        } label: {
            Image(systemName: "gearshape")
                .font(.system(size: 12))
        }
        .buttonStyle(.plain)
        .help("Diff Settings")
        .accessibilityLabel("Diff Settings")
        .popover(isPresented: $isOpen, arrowEdge: .bottom) {
            VStack(alignment: .leading, spacing: 12) {
                Text("Diff Settings")
                    .font(.headline)
                VStack(alignment: .leading, spacing: 4) {
                    Text("Whitespace")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    Toggle("Hide Whitespace Changes", isOn: Binding(
                        get: { hideWhitespace },
                        set: { onHideWhitespaceChanged?($0) }))
                    .toggleStyle(.checkbox)
                    Text("Interacting with individual lines or hunks will be disabled while hiding whitespace.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                VStack(alignment: .leading, spacing: 4) {
                    Text("Diff display")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    Picker("Diff display", selection: Binding(
                        get: { showSideBySide },
                        set: { onShowSideBySideChanged?($0) })) {
                        Text("Unified").tag(false)
                        Text("Split").tag(true)
                    }
                    .pickerStyle(.radioGroup)
                    .labelsHidden()
                }
            }
            .padding(12)
            .frame(width: 260)
        }
    }
}

#Preview {
    VStack(spacing: 0) {
        DiffHeader(
            path: "src/components/very/long/path/to/SideBySideDiff.tsx",
            status: .modified(submoduleStatus: nil))
        DiffHeader(
            path: "renamed-file.swift",
            status: .renamed(oldPath: "old-name.swift", renameIncludesModifications: false, submoduleStatus: nil))
    }
    .frame(width: 420)
}
