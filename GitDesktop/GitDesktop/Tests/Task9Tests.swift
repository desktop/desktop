import Foundation

// MARK: - Task9Tests
// Pure-function tests for Task 9 (repos/onboarding/settings/help/CLI/deeplink).
// Same harness style as Task8Tests: no test bundle needed.

public enum Task9Tests {
    public struct Failure: Sendable {
        public var test: String
        public var message: String
    }

    private static func check(_ condition: Bool, _ message: String, test: String, failures: inout [Failure]) {
        if !condition {
            failures.append(Failure(test: test, message: message))
        }
    }

    @discardableResult
    public static func runAll() -> Int {
        var failures: [Failure] = []
        testSanitizedName(&failures)
        testReadme(&failures)
        testCloneValidation(&failures)
        testCloneArgs(&failures)
        testConfigLock(&failures)
        testAuthorAndTabSize(&failures)
        testTemplates(&failures)
        testPersistence(&failures)
        testCLI(&failures)
        testDeepLink(&failures)
        testDropResolution(&failures)
        testSettingsDraft(&failures)
        if failures.isEmpty {
            print("Task9Tests: all tests passed")
        } else {
            print("Task9Tests: \(failures.count) failure(s)")
            for failure in failures {
                print("  FAIL [\(failure.test)] \(failure.message)")
            }
        }
        return failures.count
    }

    static func testSanitizedName(_ failures: inout [Failure]) {
        let test = "sanitized-name"
        check(sanitizedRepositoryName("hello") == "hello", "plain", test: test, failures: &failures)
        check(sanitizedRepositoryName("my repo!") == "my-repo-", "spaces+punct \(sanitizedRepositoryName("my repo!"))", test: test, failures: &failures)
        check(sanitizedRepositoryName("a.b-c_d") == "a.b-c_d", "allowed", test: test, failures: &failures)
        check(validateCreateRepository(name: "", parentPath: "/tmp") != nil, "empty name", test: test, failures: &failures)
        check(validateCreateRepository(name: "ok", parentPath: "") != nil, "empty path", test: test, failures: &failures)
        check(validateCreateRepository(name: "ok", parentPath: "/tmp") == nil, "valid", test: test, failures: &failures)
    }

    static func testReadme(_ failures: inout [Failure]) {
        let test = "readme"
        check(defaultReadmeContents(name: "demo") == "# demo\n", "bare", test: test, failures: &failures)
        check(defaultReadmeContents(name: "demo", description: "hi") == "# demo\nhi\n", "desc", test: test, failures: &failures)
    }

    static func testCloneValidation(_ failures: inout [Failure]) {
        let test = "clone-validation"
        check(cloneTransportError(url: "ext::something") != nil, "ext blocked", test: test, failures: &failures)
        check(cloneTransportError(url: "https://example.com/r.git") == nil, "https ok", test: test, failures: &failures)
        check(validateCloneRequest(url: "", destinationPath: "/tmp/x") != nil, "empty url", test: test, failures: &failures)
        check(validateCloneRequest(url: "https://example.com/r.git", destinationPath: "") != nil, "empty path", test: test, failures: &failures)
        check(validateCloneRequest(url: "ext::x", destinationPath: "/tmp/x") != nil, "ext url", test: test, failures: &failures)
        let home = "/Users/testuser"
        check(isClonePathSensitive(home, homeDirectory: home) == true, "home", test: test, failures: &failures)
        check(isClonePathSensitive(home + "/.ssh", homeDirectory: home) == true, ".ssh", test: test, failures: &failures)
        check(isClonePathSensitive(home + "/.ssh/keys", homeDirectory: home) == true, ".ssh child", test: test, failures: &failures)
        check(isClonePathSensitive(home + "/Code/repo", homeDirectory: home) == false, "code ok", test: test, failures: &failures)
        check(validateCloneRequest(url: "https://example.com/r.git", destinationPath: "/tmp/clone") == nil, "valid", test: test, failures: &failures)
    }

    static func testCloneArgs(_ failures: inout [Failure]) {
        let test = "clone-args"
        let args = cloneArgs(url: "https://example.com/r.git", defaultBranch: "main", withProgress: true)
        check(args.contains("clone"), "clone verb", test: test, failures: &failures)
        check(args.contains("--recursive"), "recursive", test: test, failures: &failures)
        check(args.contains("--progress"), "progress", test: test, failures: &failures)
        check(args.contains("protocol.ext.allow=never"), "ext policy \(args)", test: test, failures: &failures)
        check(!cloneArgs(url: "u", defaultBranch: "main", withProgress: false).contains("--progress"), "no progress", test: test, failures: &failures)
        check(initArgs(defaultBranch: "main") == ["-c", "init.defaultBranch=main", "init"], "init \(initArgs(defaultBranch: "main"))", test: test, failures: &failures)
    }

    static func testConfigLock(_ failures: inout [Failure]) {
        let test = "config-lock"
        check(isConfigLockFileError("error: Unable to create '/x/config.lock': File exists.") == true, "lock", test: test, failures: &failures)
        check(isConfigLockFileError("nothing to commit") == false, "clean", test: test, failures: &failures)
        check(parseConfigLockFilePath("Unable to create '/x/config.lock': File exists.") == "/x/config.lock", "path", test: test, failures: &failures)
        check(parseConfigLockFilePath("no quotes") == nil, "nil", test: test, failures: &failures)
    }

    static func testAuthorAndTabSize(_ failures: inout [Failure]) {
        let test = "author-tabsize"
        check(gitAuthorNameIsValid("Ada") == true, "name", test: test, failures: &failures)
        check(gitAuthorNameIsValid("") == false, "empty", test: test, failures: &failures)
        check(gitAuthorNameIsValid("a<b") == false, "bracket", test: test, failures: &failures)
        check(isValidTabSize(4) == true, "4", test: test, failures: &failures)
        check(isValidTabSize(3) == false, "3", test: test, failures: &failures)
    }

    static func testTemplates(_ failures: inout [Failure]) {
        let test = "templates"
        check(bundledGitIgnoreNames.contains("Swift"), "swift", test: test, failures: &failures)
        check((bundledGitIgnoreText(name: "Swift") ?? "").contains(".build"), "swift body", test: test, failures: &failures)
        check(bundledGitIgnoreText(name: "None") == nil, "none", test: test, failures: &failures)
        let mit = bundledLicenses.first { $0.name == "MIT License" }
        check(mit?.featured == true, "mit featured", test: test, failures: &failures)
        if let mit {
            let rendered = renderedLicense(mit, year: "2026", fullname: "Ada", project: "demo", description: "", email: "a@x.com")
            check(rendered.contains("2026") && rendered.contains("Ada"), "tokens \(rendered.prefix(60))", test: test, failures: &failures)
        }
    }

    static func testPersistence(_ failures: inout [Failure]) {
        let test = "persistence"
        let repos = [Repository(path: "/a", id: 1), Repository(path: "/b", id: 2, alias: "B")]
        check(RepositoryPersistence.nextID(for: repos) == 3, "next id", test: test, failures: &failures)
        check(RepositoryPersistence.nextID(for: []) == 1, "first id", test: test, failures: &failures)
        check(RepositoryPersistence.matchExisting(repositories: repos, toplevel: "/b")?.id == 2, "match", test: test, failures: &failures)
        check(RepositoryPersistence.matchExisting(repositories: repos, toplevel: "/c") == nil, "no match", test: test, failures: &failures)
        let store = UserDefaults(suiteName: "Task9Tests")!
        store.removePersistentDomain(forName: "Task9Tests")
        RepositoryPersistence.save(repos, selectedID: 2, in: store)
        let loaded = RepositoryPersistence.load(in: store)
        check(loaded.repositories.count == 2, "roundtrip count", test: test, failures: &failures)
        check(loaded.selectedID == 2, "selected", test: test, failures: &failures)
        check(loaded.repositories.first(where: { $0.id == 2 })?.alias == "B", "alias", test: test, failures: &failures)
        store.removePersistentDomain(forName: "Task9Tests")
    }

    static func testCLI(_ failures: inout [Failure]) {
        let test = "cli"
        check(CLIService.parse(arguments: ["gitdesktop", "open", "/tmp/x"]) == .openRepository(path: "/tmp/x"), "open", test: test, failures: &failures)
        check(CLIService.parse(arguments: ["gitdesktop", "clone", "https://example.com/r.git"]) == .cloneURL(url: "https://example.com/r.git", branch: nil), "clone", test: test, failures: &failures)
        check(CLIService.parse(arguments: ["gitdesktop", "clone", "u", "--branch", "dev"]) == .cloneURL(url: "u", branch: "dev"), "branch", test: test, failures: &failures)
        check(CLIService.parse(arguments: ["gitdesktop", "/tmp/x"]) == .openRepository(path: "/tmp/x"), "shorthand path", test: test, failures: &failures)
        check(CLIService.parse(arguments: ["gitdesktop", "https://example.com/r.git"]) == .cloneURL(url: "https://example.com/r.git", branch: nil), "shorthand url", test: test, failures: &failures)
        check(CLIService.parse(arguments: ["gitdesktop"]) == nil, "empty", test: test, failures: &failures)
        check(CLIService.isProbableURL("https://example.com/r.git") == true, "url", test: test, failures: &failures)
        check(CLIService.isProbableURL("/tmp/x") == false, "path", test: test, failures: &failures)
    }

    static func testDeepLink(_ failures: inout [Failure]) {
        let test = "deeplink"
        let action = DeepLinkService.parse("x-gitdesktop-client://openrepo/https%3A%2F%2Fexample.com%2Forg%2Frepo?branch=main&filepath=README.md")
        switch action {
        case .openRepository(let url, let branch, let filePath):
            check(url.contains("example.com"), "url \(url)", test: test, failures: &failures)
            check(branch == "main", "branch \(String(describing: branch))", test: test, failures: &failures)
            check(filePath == "README.md", "filepath", test: test, failures: &failures)
        case .unknown:
            check(false, "should parse", test: test, failures: &failures)
        }
        check(DeepLinkService.parse("x-gitdesktop-client://oauth?code=a&state=b").request() == nil, "oauth dropped", test: test, failures: &failures)
        check(DeepLinkService.parse("x-gitdesktop-client://openrepo/").request() == nil, "empty path", test: test, failures: &failures)
        check(DeepLinkService.branchContainsInvalidChars("a b") == true, "space invalid", test: test, failures: &failures)
        check(DeepLinkService.branchContainsInvalidChars("main") == false, "main valid", test: test, failures: &failures)
    }

    static func testDropResolution(_ failures: inout [Failure]) {
        let test = "drop"
        let actions = resolveDroppedPaths(
            ["/repos/a", "/file.txt", "/repos/new"],
            isDirectory: { $0 != "/file.txt" },
            toplevel: { $0 == "/repos/a" ? "/repos/a" : nil },
            existingID: { $0 == "/repos/a" ? 7 : nil })
        check(actions.count == 3, "3 actions", test: test, failures: &failures)
        check(actions[0] == .selectExisting(repositoryID: 7), "existing \(actions[0])", test: test, failures: &failures)
        check(actions[1] == .ignoreNotDirectory, "file ignored", test: test, failures: &failures)
        check(actions[2] == .add(path: "/repos/new"), "add", test: test, failures: &failures)
    }

    static func testSettingsDraft(_ failures: inout [Failure]) {
        let test = "settings"
        var draft = SettingsDraft()
        check(draft.validationErrors().isEmpty, "default valid", test: test, failures: &failures)
        draft.tabSize = 3
        check(!draft.validationErrors().isEmpty, "bad tabsize", test: test, failures: &failures)
        draft.tabSize = 4
        draft.committerName = "a<b"
        check(!draft.validationErrors().isEmpty, "bad name", test: test, failures: &failures)
        let store = UserDefaults(suiteName: "Task9SettingsTests")!
        store.removePersistentDomain(forName: "Task9SettingsTests")
        var saved = SettingsDraft()
        saved.tabSize = 8
        saved.confirmForcePush = false
        saved.save(in: store)
        let loaded = SettingsDraft.load(in: store)
        check(loaded.tabSize == 8, "tabsize persists", test: test, failures: &failures)
        check(loaded.confirmForcePush == false, "prompt persists", test: test, failures: &failures)
        store.removePersistentDomain(forName: "Task9SettingsTests")
    }
}

private extension DeepLinkAction {
    func request() -> (url: String, branch: String?, filePath: String?)? {
        DeepLinkService.request(for: self)
    }
}
