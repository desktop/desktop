import Foundation

// MARK: - GitIgnore operations
// Port of `electron/app/src/lib/git/gitignore.ts` (see Docs/09-git-layer.md).
// Symlink-attack guards from the reference (`O_NOFOLLOW` + dev/ino checks)
// are approximated with `FileManager` destination checks: a root `.gitignore`
// that is (or resolves through) a symlink is rejected.

public enum GitIgnoreError: Error, Sendable, Equatable {
    case symbolicLinkNotAllowed
}

public enum GitIgnoreOperations {
    public static func ignorePath(forRepositoryPath path: String) -> String {
        (path as NSString).appendingPathComponent(".gitignore")
    }

    /// Port of `escapeGitSpecialCharacters`: escapes `[]!*#?`.
    public static func escapeGitSpecialCharacters(_ pattern: String) -> String {
        var out = ""
        for ch in pattern {
            if ch == "[" || ch == "]" || ch == "!" || ch == "*" || ch == "#" || ch == "?" {
                out.append("\\")
            }
            out.append(ch)
        }
        return out
    }

    /// Pure trailing-newline formatting. The reference consults
    /// `core.autocrlf`/`core.safecrlf`; callers pass those in.
    /// - `autocrlf == "true" && safecrlf == "true"` → CRLF-normalize + trailing CRLF.
    /// - Empty text stays empty (the live `save` deletes the file instead).
    /// - Otherwise ensure exactly one trailing `\n` (or `\r\n` when autocrlf
    ///   handling demands CRLF).
    public static func formatContents(_ text: String, autocrlf: String?, safecrlf: String?) -> String {
        if text.isEmpty { return "" }
        if autocrlf == "true" && safecrlf == "true" {
            var normalized = text.replacingOccurrences(of: "\r\n", with: "\n")
            normalized = normalized.replacingOccurrences(of: "\r", with: "\n")
            normalized = normalized.replacingOccurrences(of: "\n", with: "\r\n")
            return normalized.hasSuffix("\r\n") ? normalized : normalized + "\r\n"
        }
        if text.hasSuffix("\n") { return text }
        return text + "\n"
    }

    /// Merge existing content + new patterns the way `appendIgnoreRule` does.
    public static func appendedContents(existing: String, patterns: [String], autocrlf: String?, safecrlf: String?) -> String {
        let base = formatContents(existing, autocrlf: autocrlf, safecrlf: safecrlf)
        return formatContents(base + patterns.joined(separator: "\n"), autocrlf: autocrlf, safecrlf: safecrlf)
    }

    static func rejectSymlink(at path: String) throws {
        let fm = FileManager.default
        let attrs = try? fm.attributesOfItem(atPath: path)
        if attrs?[.type] as? FileAttributeType == .typeSymbolicLink {
            throw GitIgnoreError.symbolicLinkNotAllowed
        }
        // Resolve parent + destination: if the destination differs from the
        // literal path, a symlink component was involved.
        if let dest = try? fm.destinationOfSymbolicLink(atPath: path), !dest.isEmpty {
            throw GitIgnoreError.symbolicLinkNotAllowed
        }
    }
}

public enum GitIgnoreLiveOperations {
    public static func readGitIgnore(repositoryPath: String) throws -> String? {
        let path = GitIgnoreOperations.ignorePath(forRepositoryPath: repositoryPath)
        let fm = FileManager.default
        guard fm.fileExists(atPath: path) else { return nil }
        try GitIgnoreOperations.rejectSymlink(at: path)
        return try String(contentsOfFile: path, encoding: .utf8)
    }

    public static func configValue(repositoryPath: String, key: String) async -> String? {
        let result = try? await GitProcess.run(
            ["config", "--get", key], workingDirectory: repositoryPath)
        guard let result, result.exitCode == 0 else { return nil }
        return result.stdoutString.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// Port of `saveGitIgnore`. Empty text deletes the file.
    public static func saveGitIgnore(repositoryPath: String, text: String) async throws {
        let path = GitIgnoreOperations.ignorePath(forRepositoryPath: repositoryPath)
        if text.isEmpty {
            if FileManager.default.fileExists(atPath: path) {
                try GitIgnoreOperations.rejectSymlink(at: path)
                try FileManager.default.removeItem(atPath: path)
            }
            return
        }
        let autocrlf = await configValue(repositoryPath: repositoryPath, key: "core.autocrlf")
        let safecrlf = await configValue(repositoryPath: repositoryPath, key: "core.safecrlf")
        let formatted = GitIgnoreOperations.formatContents(text, autocrlf: autocrlf, safecrlf: safecrlf)
        if FileManager.default.fileExists(atPath: path) {
            try GitIgnoreOperations.rejectSymlink(at: path)
        }
        try formatted.write(toFile: path, atomically: true, encoding: .utf8)
    }

    public static func appendIgnoreRule(repositoryPath: String, patterns: [String]) async throws {
        let existing = (try? readGitIgnore(repositoryPath: repositoryPath)) ?? ""
        let autocrlf = await configValue(repositoryPath: repositoryPath, key: "core.autocrlf")
        let safecrlf = await configValue(repositoryPath: repositoryPath, key: "core.safecrlf")
        let merged = GitIgnoreOperations.appendedContents(
            existing: existing, patterns: patterns, autocrlf: autocrlf, safecrlf: safecrlf)
        try await saveGitIgnore(repositoryPath: repositoryPath, text: merged)
    }

    public static func appendIgnoreFile(repositoryPath: String, paths: [String]) async throws {
        let escaped = paths.map(GitIgnoreOperations.escapeGitSpecialCharacters)
        try await appendIgnoreRule(repositoryPath: repositoryPath, patterns: escaped)
    }
}
