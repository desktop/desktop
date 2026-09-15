import Foundation

// MARK: - DeepLinkService
// Task 9 `x-gitdesktop-client://openrepo/<url>?branch&filepath` deeplink.
// Port of `electron/app/src/lib/parse-app-url.ts` (`open-repository-from-url`
// only — the `oauth` variant is deleted per scope; PR query items are parsed
// but ignored since there is no GitHub integration).

public enum DeepLinkAction: Sendable, Equatable {
    case openRepository(url: String, branch: String?, filePath: String?)
    case unknown(url: String)
}

public enum DeepLinkService {
    public static let scheme = "x-gitdesktop-client"

    /// Parse a deeplink URL string into an action.
    public static func parse(_ urlString: String) -> DeepLinkAction {
        guard let components = URLComponents(string: urlString),
              let host = components.host?.lowercased()
        else { return .unknown(url: urlString) }
        guard host == "openrepo" else { return .unknown(url: urlString) }
        // `openrepo/<url>`: the repo URL is the path after the host.
        // URLComponents drops the host, so reconstruct from path.
        var repoURL = components.path
        if repoURL.hasPrefix("/") { repoURL.removeFirst() }
        // Percent-decode (the sender encodes the repo URL as the path).
        repoURL = repoURL.removingPercentEncoding ?? repoURL
        // The reference requires a non-empty path resembling a URL.
        guard !repoURL.isEmpty, repoURL != "/" else {
            return .unknown(url: urlString)
        }
        // Handle `openrepo/https://host/org/repo` where URLComponents splits
        // the embedded scheme: path is "/https://..." only when the sender
        // encoded it. Also accept the raw form `openrepo?url=...`.
        let query = queryDictionary(components.queryItems)
        if repoURL.isEmpty, let fallback = query["url"], !fallback.isEmpty {
            repoURL = fallback
        }
        guard !repoURL.isEmpty else { return .unknown(url: urlString) }
        let branch = query["branch"]
        let filePath = query["filepath"]
        // Reject invalid branch chars (port of `testForInvalidChars` gate:
        // reject spaces, `~^:?*[\` sequences that `git check-ref-format` rejects
        // at the coarse level used by the reference parser).
        if let branch, branchContainsInvalidChars(branch) {
            return .unknown(url: urlString)
        }
        return .openRepository(url: repoURL, branch: branch, filePath: filePath)
    }

    private static func queryDictionary(_ items: [URLQueryItem]?) -> [String: String] {
        var dict: [String: String] = [:]
        for item in items ?? [] {
            if dict[item.name] == nil, let value = item.value {
                dict[item.name] = value
            }
        }
        return dict
    }

    /// Coarse invalid-char check mirroring `sanitize-ref-name.ts`
    /// `testForInvalidChars` (space, `~`, `^`, `:`, `?`, `*`, `[`, `\`).
    public static func branchContainsInvalidChars(_ branch: String) -> Bool {
        branch.contains(" ") || branch.contains("~") || branch.contains("^")
            || branch.contains(":") || branch.contains("?")
            || branch.contains("*") || branch.contains("[")
            || branch.contains("\\")
    }

    /// Handle an action: resolve to a clone-or-open request.
    /// Returns the remote URL + branch the caller should clone-or-open.
    public static func request(for action: DeepLinkAction) -> (url: String, branch: String?, filePath: String?)? {
        switch action {
        case .openRepository(let url, let branch, let filePath):
            return (url, branch, filePath)
        case .unknown:
            return nil
        }
    }
}
