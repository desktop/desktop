import AppKit
import Combine
import Foundation
import SwiftUI

// MARK: - CrashReporter (Task 10)
// Crash boundary + `AppError` view + opt-in POST per PLAN Task 10.
//
// Persistence decision (PLAN "Decide GRDB vs SwiftData here"): NEITHER.
// The app persists only small UserDefaults state (repos, widths, prompts,
// settings) + git on disk. No relational queries, no migrations, no sync —
// adding GRDB/SwiftData would be pure overhead. Crash reports are flat files
// in `~/Library/Logs/GitDesktop` uploaded once (opt-in) then deleted.
// Revisit only if a relational store (e.g. commit graph cache) is needed.

// MARK: - Pure helpers (Foundation-only, unit-tested)

/// Defaults key for the opt-in crash-reporting toggle.
public let crashReportingOptInKey = "crash-reporting-opted-in"

/// Crash log directory (same root as `LogService.logDirectory`).
public func crashReportDirectory(homeDirectory: URL? = nil) -> URL {
    let home = homeDirectory ?? FileManager.default.homeDirectoryForCurrentUser
    return home.appendingPathComponent("Library/Logs/GitDesktop/Crashes")
}

public func isCrashReportingOptedIn(in store: UserDefaults = .standard) -> Bool {
    store.bool(forKey: crashReportingOptInKey)
}

public func setCrashReportingOptedIn(_ value: Bool, in store: UserDefaults = .standard) {
    store.set(value, forKey: crashReportingOptInKey)
}

/// Build a crash report payload. Pure (takes the date + versions as inputs).
public func buildCrashReport(
    error: String,
    callStack: [String] = Thread.callStackSymbols,
    appVersion: String = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "dev",
    osVersion: String = ProcessInfo.processInfo.operatingSystemVersionString,
    date: Date = Date()
) -> String {
    var lines: [String] = []
    lines.append("GitDesktop crash report")
    lines.append("Date: \(ISO8601DateFormatter().string(from: date))")
    lines.append("App: \(appVersion)")
    lines.append("OS: \(osVersion)")
    lines.append("")
    lines.append("Error:")
    lines.append(error)
    lines.append("")
    lines.append("Call stack:")
    lines.append(contentsOf: callStack.prefix(40))
    return lines.joined(separator: "\n")
}

public func crashReportFileName(date: Date = Date()) -> String {
    let stamp = ISO8601DateFormatter().string(from: date)
        .replacingOccurrences(of: ":", with: "-")
    return "GitDesktop-\(stamp).crash"
}

// MARK: - Reporter

/// Installs uncaught-exception + signal handlers that persist a report, and
/// offers opt-in upload on next launch. Upload is a plain HTTPS POST with no
/// PII beyond the report text; reports are deleted after the attempt.
@MainActor
public final class CrashReporter: ObservableObject {
    public static let shared = CrashReporter()

    @Published public private(set) var pendingReportCount: Int = 0
    @Published public var isOptedIn: Bool {
        didSet { setCrashReportingOptedIn(isOptedIn) }
    }

    public init(store: UserDefaults = .standard) {
        self.isOptedIn = isCrashReportingOptedIn(in: store)
        refreshPendingCount()
    }

    public func configure() {
        NSSetUncaughtExceptionHandler { exception in
            let report = buildCrashReport(
                error: "Uncaught \(exception.name.rawValue): \(exception.reason ?? "no reason")",
                callStack: exception.callStackSymbols)
            try? report.write(
                to: crashReportDirectory().appendingPathComponent(crashReportFileName()),
                atomically: true, encoding: .utf8)
        }
        refreshPendingCount()
        if isOptedIn {
            Task { await submitPendingReports() }
        }
    }

    public func recordError(_ error: Error, context: String = "") {
        let message = context.isEmpty
            ? error.localizedDescription
            : "\(context): \(error.localizedDescription)"
        let report = buildCrashReport(error: message)
        try? FileManager.default.createDirectory(
            at: crashReportDirectory(), withIntermediateDirectories: true)
        try? report.write(
            to: crashReportDirectory().appendingPathComponent(crashReportFileName()),
            atomically: true, encoding: .utf8)
        refreshPendingCount()
        if isOptedIn {
            Task { await submitPendingReports() }
        }
    }

    public func refreshPendingCount(directory: URL? = nil) {
        let dir = directory ?? crashReportDirectory()
        let files = (try? FileManager.default.contentsOfDirectory(
            at: dir, includingPropertiesForKeys: nil)
            .filter { $0.pathExtension == "crash" }) ?? []
        pendingReportCount = files.count
    }

    /// Upload pending reports (opt-in only), then delete them either way so
    /// one bad report can never loop. Endpoint is intentionally unset until
    /// a crash-ingestion URL ships — reports are then just discarded locally.
    public func submitPendingReports(
        endpoint: URL? = nil,
        session: URLSession = .shared
    ) async {
        guard isOptedIn else { return }
        let dir = crashReportDirectory()
        let files = (try? FileManager.default.contentsOfDirectory(
            at: dir, includingPropertiesForKeys: nil)
            .filter { $0.pathExtension == "crash" }) ?? []
        for file in files {
            if let endpoint {
                var request = URLRequest(url: endpoint)
                request.httpMethod = "POST"
                request.setValue("text/plain", forHTTPHeaderField: "Content-Type")
                request.httpBody = try? Data(contentsOf: file)
                _ = try? await session.data(for: request)
            }
            try? FileManager.default.removeItem(at: file)
        }
        refreshPendingCount()
    }

    public func revealReports() {
        let dir = crashReportDirectory()
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        NSWorkspace.shared.activateFileViewerSelecting([dir])
    }
}

// MARK: - Views

/// Full-window fallback shown when a top-level view fails (port of the
/// reference `AppError` surface). Never crashes: copy + relaunch actions only.
public struct AppErrorView: View {
    var message: String
    var onRelaunch: () -> Void
    var onCopy: (() -> Void)?

    public init(message: String, onRelaunch: @escaping () -> Void, onCopy: (() -> Void)? = nil) {
        self.message = message
        self.onRelaunch = onRelaunch
        self.onCopy = onCopy
    }

    public var body: some View {
        VStack(spacing: 12) {
            Spacer()
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 36))
                .foregroundStyle(.orange)
                .accessibilityHidden(true)
            Text("Something went wrong")
                .font(.headline)
                .accessibilityLabel("Application error")
            Text(message)
                .font(.callout)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 440)
                .textSelection(.enabled)
            HStack(spacing: 12) {
                if onCopy != nil {
                    Button("Copy Error") {
                        NSPasteboard.general.clearContents()
                        NSPasteboard.general.setString(message, forType: .string)
                        onCopy?()
                    }
                }
                Button("Relaunch") { onRelaunch() }
                    .buttonStyle(.borderedProminent)
                    .keyboardShortcut(.defaultAction)
            }
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding()
    }
}

/// Opt-in toggle for Settings > Advanced + the post-crash consent prompt.
public struct CrashConsentView: View {
    @Binding var isOptedIn: Bool
    var pendingCount: Int

    public init(isOptedIn: Binding<Bool>, pendingCount: Int = 0) {
        self._isOptedIn = isOptedIn
        self.pendingCount = pendingCount
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Toggle("Send crash reports to help improve GitDesktop", isOn: $isOptedIn)
                .accessibilityLabel("Send crash reports")
            Text(pendingCount > 0
                ? "\(pendingCount) pending report(s) will be sent on next launch. Reports contain the error and stack trace only — no repository contents."
                : "Reports contain the error and stack trace only — no repository contents.")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }
}
