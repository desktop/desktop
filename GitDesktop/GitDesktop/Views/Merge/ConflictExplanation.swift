import SwiftUI

// MARK: - ConflictExplanation (Task 10)
// Apple Intelligence Explain-only button per conflicted file.
// Read-only: explains OURS vs THEIRS + how to choose manually. Auto-apply of
// resolutions is explicitly out of scope (Docs/01-scope.md §3) — this view
// never writes files.

public struct ExplainConflictButton: View {
    public var path: String
    public var markerExcerpt: String
    @StateObject private var ai = AppleIntelligenceService()
    @State private var isOpen = false
    @State private var explanation: String?
    @State private var isLoading = false
    @State private var errorText: String?

    public init(path: String, markerExcerpt: String = "") {
        self.path = path
        self.markerExcerpt = markerExcerpt
    }

    public var body: some View {
        Group {
            if ai.availability.isAvailable {
                Button {
                    isOpen.toggle()
                    if isOpen { Task { await explain() } }
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "sparkles")
                        Text("Explain")
                    }
                }
                .buttonStyle(.link)
                .help("Explain these conflict markers (on-device, read-only)")
                .accessibilityLabel("Explain conflicts in \(path)")
                .popover(isPresented: $isOpen) {
                    explanationPopover
                }
            }
        }
        .onAppear { ai.refreshAvailability() }
    }

    private var explanationPopover: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Conflicts in \(path)")
                .font(.headline)
            if isLoading {
                HStack(spacing: 6) {
                    ProgressView().controlSize(.small)
                    Text("Explaining…")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                }
                .accessibilityLabel("Explaining conflicts")
            } else if let errorText {
                Text(errorText)
                    .font(.callout)
                    .foregroundStyle(.red)
            } else if let explanation {
                ScrollView {
                    Text(explanation)
                        .font(.callout)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .textSelection(.enabled)
                }
                .frame(maxHeight: 220)
                Text("Read-only explanation — resolve the file manually, then mark as resolved.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            HStack {
                Spacer()
                if !isLoading {
                    Button("Re-explain") { Task { await explain() } }
                        .buttonStyle(.link)
                }
                Button("Close") { isOpen = false }
                    .keyboardShortcut(.defaultAction)
            }
        }
        .padding(12)
        .frame(width: 360)
    }

    private func explain() async {
        isLoading = true
        errorText = nil
        do {
            explanation = try await ai.explainConflict(path: path, markerExcerpt: markerExcerpt)
        } catch let error as AIError {
            switch error {
            case .unavailable(let availability):
                errorText = availability.statusText
            case .cancelled:
                break
            case .generationFailed(let message):
                errorText = message
            }
        } catch {
            errorText = error.localizedDescription
        }
        isLoading = false
    }
}
