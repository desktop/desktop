import SwiftUI

// MARK: - ChangedFileRow
// Port of `electron/app/src/ui/changes/changed-file.tsx`: tri-state checkbox
// (tabIndex -1 in the reference — Space/Enter on the row toggles instead) +
// `PathLabel` + status icon + live-region message. Context menu mirrors the
// reference (minus Open-in-editor/default-app, deleted per scope).

public struct ChangedFileRow: View {
    @ObservedObject public var changes: ChangesStore
    public var file: WorkingDirectoryFileChange
    public var isSelected: Bool
    public var availableWidth: CGFloat

    public init(
        changes: ChangesStore,
        file: WorkingDirectoryFileChange,
        isSelected: Bool,
        availableWidth: CGFloat = 250
    ) {
        self.changes = changes
        self.file = file
        self.isSelected = isSelected
        self.availableWidth = availableWidth
    }

    private var include: IncludeState { includeState(for: file) }
    private var statusName: String { displayName(for: file.status) }

    public var body: some View {
        HStack(spacing: 5) {
            TriStateCheckbox(
                state: include,
                action: { changes.toggleInclude(file) }
            )
            .frame(width: 20)
            .help(checkboxTooltip)

            PathLabel(
                path: file.path,
                matchRanges: matchRanges(
                    for: changes.filter.filterText, in: file.path))
                .frame(maxWidth: .infinity, alignment: .leading)

            Image(systemName: statusIconName(for: file.status))
                .foregroundStyle(statusColor)
                .help(statusName)
                .frame(width: 16)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 4)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(file.path) \(statusName) \(includeDescription(for: file))")
        .accessibilityAddTraits(isSelected ? [.isSelected] : [])
        .contextMenu { rowContextMenu }
    }

    private var checkboxTooltip: String {
        switch include {
        case .on: return "Unstage file"
        case .off: return "Stage file"
        case .mixed: return "Partially staged — click to unstage"
        }
    }

    private var statusColor: Color {
        switch file.status.kind {
        case .new, .untracked: return .green
        case .deleted: return .red
        case .modified: return .yellow
        case .renamed: return .blue
        case .copied: return .blue
        case .conflicted: return .orange
        }
    }

    @ViewBuilder
    private var rowContextMenu: some View {
        Button("Discard changes…") {
            changes.requestDiscard(files: [file])
        }
        Button("Ignore file (add to .gitignore)") {
            changes.ignore(path: file.path)
        }
        let ext = (file.path as NSString).pathExtension
        if !ext.isEmpty {
            Button("Ignore all *.\(ext) files") {
                changes.ignoreExtension(of: file.path)
            }
        }
        Divider()
        Button("Reveal in Finder") {
            changes.revealInFinder(path: file.path)
        }
        Button("Copy path") {
            changes.copyPath(file.path)
        }
    }
}

// MARK: - TriStateCheckbox

/// Tri-state checkbox: On / Off / Mixed (partial). Port of
/// `ui/lib/checkbox.tsx` (`CheckboxValue.On/Off/Mixed`).
public struct TriStateCheckbox: View {
    public var state: IncludeState
    public var action: () -> Void

    public init(state: IncludeState, action: @escaping () -> Void) {
        self.state = state
        self.action = action
    }

    public var body: some View {
        Button(action: action) {
            Image(systemName: imageName)
                .foregroundColor(state == .off ? .secondary : .accentColor)
                .font(.system(size: 14))
        }
        .buttonStyle(.plain)
        .focusable(false)
        .accessibilityLabel(accessibilityLabel)
    }

    private var imageName: String {
        switch state {
        case .on: return "checkmark.square.fill"
        case .off: return "square"
        case .mixed: return "minus.square.fill"
        }
    }

    private var accessibilityLabel: String {
        switch state {
        case .on: return "Included"
        case .off: return "Not included"
        case .mixed: return "Partially included"
        }
    }
}
