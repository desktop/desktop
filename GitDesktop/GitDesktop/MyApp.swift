import SwiftUI
import AppKit

@main struct MyApp: App {
    @StateObject private var store = AppStore()
    @StateObject private var updater = UpdateService()
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var delegate

    var body: some Scene {
        WindowGroup {
            ContentView(store: store, updater: updater)
                .onAppear {
                    delegate.store = store
                    delegate.updater = updater
                    CrashReporter.shared.configure()
                    updater.evaluateMoveToApplications()
                    if updater.moveStatus == .needed {
                        store.showPopup(.moveToApplicationsFolder)
                    }
                    handleLaunchArguments()
                }
                .onOpenURL { url in
                    handleDeepLink(url)
                }
        }
        .commands {
            GitDesktopCommands(store: store, updater: updater)
        }
        Settings {
            // Native Settings scene hosts the same 5-tab form (also reachable
            // via the `.preferences` popup for parity with the reference).
            SettingsSceneHost(store: store)
        }
    }

    // MARK: CLI shim (`open path`, `clone url`)

    private func handleLaunchArguments() {
        // When launched via the `gitdesktop` shim, argv carries the action.
        let args = ProcessInfo.processInfo.arguments
        guard args.count > 1,
              let action = CLIService.parse(arguments: args) else { return }
        Task { @MainActor in
            await performCLIAction(action)
        }
    }

    @MainActor
    private func performCLIAction(_ action: CLIAction) async {
        switch action {
        case .openRepository(let path):
            try? await store.addLocalRepository(at: path)
        case .cloneURL(let url, let branch):
            store.showPopup(.cloneRepository(initialURL: url))
            _ = branch
        }
    }

    // MARK: Deeplink (`x-gitdesktop-client://openrepo/...`)

    @MainActor
    private func handleDeepLink(_ url: URL) {
        let action = DeepLinkService.parse(url.absoluteString)
        guard let request = DeepLinkService.request(for: action) else { return }
        // Match an existing clone by URL, else prompt to clone.
        let known = store.repositories.first { repo in
            store.repositoryStates[repo.hash]?.remote?.url == request.url
        }
        if let known {
            store.selectRepository(known)
            return
        }
        store.showPopup(.cloneRepository(initialURL: request.url))
    }
}

// MARK: - Settings scene host

struct SettingsSceneHost: View {
    @ObservedObject var store: AppStore

    var body: some View {
        // The native Settings scene needs a popup value; reuse a transient
        // `.preferences` popup so Save/Cancel close the window via the stack.
        SettingsView(store: store, popup: .preferences(initialTab: nil), initialTab: .git)
            .frame(width: 640, height: 440)
    }
}

// MARK: - AppDelegate (dock drop, quit guard)

final class AppDelegate: NSObject, NSApplicationDelegate {
    var store: AppStore?
    var updater: UpdateService?

    func application(_ application: NSApplication, openFile filename: String) -> Bool {
        // Dock drop + `open path`: folders only (ignore files).
        var isDir: ObjCBool = false
        guard FileManager.default.fileExists(atPath: filename, isDirectory: &isDir),
              isDir.boolValue
        else { return false }
        guard let store else { return false }
        Task { @MainActor in
            try? await store.addLocalRepository(at: filename)
        }
        return true
    }

    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        // `InstallingUpdate` blocks quit while downloading (port of the
        // reference `InstallingUpdate` popup semantics).
        if updater?.blocksQuit == true {
            store?.showPopup(.installingUpdate)
            return .terminateCancel
        }
        return .terminateNow
    }
}
