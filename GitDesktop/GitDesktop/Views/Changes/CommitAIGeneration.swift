import Combine
import SwiftUI

// MARK: - CommitAIGeneration (Task 10)
// Apple Intelligence commit-message button for `CommitBoxView`.
// States: idle → generating (cancel) → result. Keeps the reference Copilot
// semantics minus network/quota/model-picker:
// - Hidden when `availability.isAvailable == false` (OS <26, model missing,
//   or Settings toggle off) — same as Copilot flag-gating.
// - First-run disclaimer sheet (privacy: on-device) with "Don't ask again".
// - Overwrite warning when summary/description are non-empty.
// - Cancel aborts the stream; Regenerate re-runs; result sets
//   `generatedByAppleIntelligence` for stats.

public struct CommitAIGenerationButton: View {
    @ObservedObject var changes: ChangesStore
    @StateObject private var ai = AppleIntelligenceService()
    @State private var isGenerating = false
    @State private var generatedFlag = false
    @State private var showDisclaimer = false
    @State private var showOverwriteWarning = false
    @State private var pendingContext: AIDiffContext?
    @State private var streamTask: Task<Void, Never>?
    @State private var errorText: String?

    public init(changes: ChangesStore) {
        self.changes = changes
    }

    public var body: some View {
        Group {
            if ai.availability.isAvailable {
                Button {
                    onGenerateTapped()
                } label: {
                    HStack(spacing: 4) {
                        if isGenerating {
                            ProgressView().controlSize(.small)
                        } else {
                            Image(systemName: "sparkles")
                        }
                        Text(isGenerating ? "Generating…" : (generatedFlag ? "Regenerate" : "Generate"))
                    }
                }
                .buttonStyle(.plain)
                .help("Generate commit message with Apple Intelligence (on-device)")
                .accessibilityLabel(isGenerating ? "Generating commit message" : "Generate commit message with Apple Intelligence")
                .accessibilityAnnouncement(statusAnnouncement)
                .contextMenu {
                    if generatedFlag {
                        Button("Regenerate") { onGenerateTapped(force: true) }
                    }
                    Button("Cancel") { cancel() }.disabled(!isGenerating)
                }
                if isGenerating {
                    Button("Cancel") { cancel() }
                        .buttonStyle(.link)
                        .accessibilityLabel("Cancel generation")
                }
            }
        }
        .onAppear { ai.refreshAvailability() }
        .onReceive(NotificationCenter.default.publisher(for: UserDefaults.didChangeNotification)) { _ in
            ai.refreshAvailability()
        }
        .sheet(isPresented: $showDisclaimer) {
            AIDisclaimerSheet(
                onAccept: { dontAskAgain in
                    if dontAskAgain {
                        UserDefaults.standard.set(true, forKey: Defaults.appleIntelligenceDisclaimerAcknowledged)
                    }
                    showDisclaimer = false
                    startGeneration()
                },
                onCancel: { showDisclaimer = false })
        }
        .sheet(isPresented: $showOverwriteWarning) {
            AIOverwriteWarningSheet(
                onOverwrite: {
                    showOverwriteWarning = false
                    startGeneration()
                },
                onCancel: { showOverwriteWarning = false })
        }
        .alert("Generation failed", isPresented: Binding(
            get: { errorText != nil },
            set: { if !$0 { errorText = nil } }
        )) {
            Button("OK") { errorText = nil }
        } message: {
            Text(errorText ?? "")
        }
    }

    private var statusAnnouncement: String {
        if isGenerating { return "Generating commit message" }
        if generatedFlag { return "Commit message generated" }
        return ""
    }

    private func onGenerateTapped(force: Bool = false) {
        if isGenerating {
            cancel()
            return
        }
        let acknowledged = UserDefaults.standard.bool(
            forKey: Defaults.appleIntelligenceDisclaimerAcknowledged)
        if aiShouldShowDisclaimer(acknowledged: acknowledged, dontAskAgain: false) {
            pendingContext = makeContext()
            showDisclaimer = true
            return
        }
        if !force, aiShouldWarnBeforeOverwrite(
            summary: changes.summary, description: changes.commitDescription) {
            pendingContext = makeContext()
            showOverwriteWarning = true
            return
        }
        startGeneration()
    }

    private func makeContext() -> AIDiffContext {
        let files = changes.filesToBeCommitted.map(\.path)
        let state = changes.store.repositoryStates[changes.repository.hash]
        let recent = state.flatMap { _ in [] as [String]? } ?? []
        let branch = changes.branch
        return AIDiffContext(
            stagedFileNames: files,
            diffStat: "\(files.count) file(s) staged",
            recentSummaries: recent,
            branchName: branch)
    }

    private func startGeneration() {
        let context = pendingContext ?? makeContext()
        pendingContext = nil
        cancel()
        isGenerating = true
        generatedFlag = false
        errorText = nil
        streamTask = Task { @MainActor in
            var accumulated = ""
            do {
                let stream = ai.generateCommitMessage(context: context)
                for try await token in stream {
                    if Task.isCancelled { break }
                    accumulated += token
                    let parts = splitGeneratedMessage(accumulated)
                    changes.summary = parts.summary
                    changes.commitDescription = parts.body
                }
                if !Task.isCancelled, !accumulated.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    generatedFlag = true
                    changes.store.objectWillChange.send()
                    AccessibilityAnnouncementModifier.announce("Commit message generated")
                }
            } catch is CancellationError {
                return
            } catch let error as AIError {
                switch error {
                case .cancelled:
                    break
                case .unavailable(let availability):
                    errorText = availability.statusText
                case .generationFailed(let message):
                    errorText = message
                }
            } catch {
                errorText = error.localizedDescription
            }
            isGenerating = false
        }
    }

    private func cancel() {
        streamTask?.cancel()
        streamTask = nil
        ai.cancel()
        isGenerating = false
    }
}

/// First-run disclaimer (privacy: on-device). Replaces the Copilot
/// disclaimer + model picker + quota card (all deleted per scope).
public struct AIDisclaimerSheet: View {
    public var onAccept: (Bool) -> Void
    public var onCancel: () -> Void
    @State private var dontAskAgain = false

    public init(onAccept: @escaping (Bool) -> Void, onCancel: @escaping () -> Void) {
        self.onAccept = onAccept
        self.onCancel = onCancel
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Generate with Apple Intelligence")
                .font(.headline)
            Text("Runs on-device with Apple Intelligence. Diff content never leaves this Mac.")
                .font(.callout)
            Toggle("Don't ask again", isOn: $dontAskAgain)
            HStack {
                Spacer()
                Button("Cancel", action: onCancel)
                    .keyboardShortcut(.cancelAction)
                Button("Generate") { onAccept(dontAskAgain) }
                    .keyboardShortcut(.defaultAction)
                    .buttonStyle(.borderedProminent)
            }
        }
        .padding(16)
        .frame(width: 400)
        .focusTrap("Generate with Apple Intelligence")
        .alertDialogSemantics("Generate with Apple Intelligence")
    }
}

/// Overwrite warning when summary/description are non-empty.
public struct AIOverwriteWarningSheet: View {
    public var onOverwrite: () -> Void
    public var onCancel: () -> Void

    public init(onOverwrite: @escaping () -> Void, onCancel: @escaping () -> Void) {
        self.onOverwrite = onOverwrite
        self.onCancel = onCancel
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Overwrite commit message?")
                .font(.headline)
            Text("Generating will replace the current summary and description.")
                .font(.callout)
            HStack {
                Spacer()
                Button("Cancel", action: onCancel)
                    .keyboardShortcut(.cancelAction)
                Button("Overwrite", action: onOverwrite)
                    .keyboardShortcut(.defaultAction)
                    .buttonStyle(.borderedProminent)
            }
        }
        .padding(16)
        .frame(width: 380)
        .focusTrap("Overwrite commit message?")
        .alertDialogSemantics("Overwrite commit message?")
    }
}
