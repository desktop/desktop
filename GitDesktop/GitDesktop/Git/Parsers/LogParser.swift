import Foundation

// MARK: - LogParser
// Pure-function port of the parsing half of `electron/app/src/lib/git/log.ts`
// (`--date=raw`, NUL-delimited `--format=`, numstat/raw changed files) plus
// trailer unfolding from `lib/git/interpret-trailers.ts`.

public enum LogParser {
    /// Fields emitted by `createLogParser` in `git-delimiter-parser.ts`,
    /// joined with `%x00` under `-z`.
    public static let logFieldOrder = [
        "sha", "shortSha", "summary", "body",
        "author", "committer", "parents", "trailers", "refs",
    ]

    /// Split NUL-delimited log output into per-record field dictionaries.
    public static func parseDelimitedRecords(_ output: Data, fieldCount: Int) -> [[String]] {
        let text = String(data: output, encoding: .utf8) ?? ""
        let records = text.components(separatedBy: "\0")
        var out: [[String]] = []
        var index = 0
        while index + fieldCount <= records.count {
            // The original stops before a trailing incomplete chunk.
            if index + fieldCount == records.count
                && records[index...].allSatisfy({ $0.isEmpty }) {
                break
            }
            out.append(Array(records[index..<(index + fieldCount)]))
            index += fieldCount
        }
        return out
    }

    /// Parse one unfolded trailer line (`Token: value` or configured separator).
    public static func parseSingleUnfoldedTrailer(_ line: String, separators: String = ":") -> Trailer? {
        for separator in separators {
            if let range = line.range(of: String(separator)),
               range.lowerBound != line.startIndex {
                let token = String(line[..<range.lowerBound]).trimmingCharacters(in: .whitespaces)
                let value = String(line[range.upperBound...]).trimmingCharacters(in: .whitespaces)
                if !token.isEmpty {
                    return Trailer(token: token, value: value)
                }
            }
        }
        return nil
    }

    /// Parse unfolded trailer output (one trailer per line).
    public static func parseRawUnfoldedTrailers(_ trailers: String, separators: String = ":") -> [Trailer] {
        trailers.components(separatedBy: "\n").compactMap {
            $0.isEmpty ? nil : parseSingleUnfoldedTrailer($0, separators: separators)
        }
    }

    /// Parse the `refs` decoration field: `(HEAD -> main, tag: v1, origin/main)`.
    /// Returns `(tags, branchRefs)`.
    public static func parseRefs(_ refs: String) -> (tags: [String], branches: [String]) {
        let trimmed = refs.trimmingCharacters(in: .whitespaces)
        guard trimmed.hasPrefix("("), trimmed.hasSuffix(")"), trimmed.count > 2 else {
            return ([], [])
        }
        let inner = String(trimmed.dropFirst().dropLast())
        if inner.isEmpty { return ([], []) }
        var tags: [String] = []
        var branches: [String] = []
        for part in inner.components(separatedBy: ", ") {
            if part.hasPrefix("tag: ") {
                tags.append(String(part.dropFirst("tag: ".count)))
            } else {
                branches.append(part)
            }
        }
        return (tags, branches)
    }

    /// Build a `Commit` from one parsed record dictionary.
    public static func commitFromRecord(
        sha: String,
        shortSha: String,
        summary: String,
        body: String,
        author: String,
        committer: String,
        parents: String,
        trailers: String,
        refs: String
    ) -> Commit? {
        guard let authorIdentity = try? CommitIdentity.parseIdentity(author),
              let committerIdentity = try? CommitIdentity.parseIdentity(committer)
        else { return nil }
        let parentSHAs = parents.isEmpty ? [] : parents.components(separatedBy: " ")
        let parsedTrailers = parseRawUnfoldedTrailers(trailers)
        let (tags, _) = parseRefs(refs)
        return Commit(
            sha: sha,
            shortSha: shortSha,
            summary: summary,
            body: body,
            author: authorIdentity,
            committer: committerIdentity,
            parentSHAs: parentSHAs,
            trailers: parsedTrailers,
            tags: tags)
    }

    // MARK: - Changed files (numstat + raw)

    /// Map a raw `--raw` status token to an app status.
    /// Port of `mapStatus` in `lib/git/log.ts`.
    public static func mapRawStatus(
        _ rawStatus: String,
        oldPath: String?,
        srcMode: String,
        dstMode: String
    ) -> AppFileStatus {
        let status = rawStatus.trimmingCharacters(in: .whitespaces)
        let submoduleStatus = mapSubmoduleFileModes(status: status, srcMode: srcMode, dstMode: dstMode)
        switch status {
        case "M": return .modified(submoduleStatus: submoduleStatus)
        case "A": return .new(submoduleStatus: submoduleStatus)
        case "?": return .untracked(submoduleStatus: submoduleStatus)
        case "D": return .deleted(submoduleStatus: submoduleStatus)
        case "R" where oldPath != nil:
            return .renamed(oldPath: oldPath!, renameIncludesModifications: false, submoduleStatus: submoduleStatus)
        case "C" where oldPath != nil:
            return .copied(oldPath: oldPath!, renameIncludesModifications: false, submoduleStatus: submoduleStatus)
        default:
            if status.range(of: #"^R[0-9]+$"#, options: .regularExpression) != nil, let oldPath {
                return .renamed(
                    oldPath: oldPath,
                    renameIncludesModifications: status != "R100",
                    submoduleStatus: submoduleStatus)
            }
            if status.range(of: #"^C[0-9]+$"#, options: .regularExpression) != nil, let oldPath {
                return .copied(oldPath: oldPath, renameIncludesModifications: false, submoduleStatus: submoduleStatus)
            }
            return .modified(submoduleStatus: submoduleStatus)
        }
    }

    private static func mapSubmoduleFileModes(status: String, srcMode: String, dstMode: String) -> SubmoduleStatus? {
        // File mode 160000 is git's submodule marker.
        if srcMode == "160000" && dstMode == "160000" && status == "M" {
            return SubmoduleStatus(commitChanged: true, modifiedChanges: false, untrackedChanges: false)
        }
        if (srcMode == "160000" && status == "D") || (dstMode == "160000" && status == "A") {
            return SubmoduleStatus(commitChanged: false, modifiedChanges: false, untrackedChanges: false)
        }
        return nil
    }

    /// Parse `git log -C -M -m -1 --first-parent --raw --format=format: --numstat -z`
    /// output into committed file changes.
    /// Port of `parseRawLogWithNumstat` in `log.ts`.
    public static func parseChangedFiles(
        _ stdout: String,
        commitish: String,
        parentCommitish: String
    ) -> [CommittedFileChange] {
        // NUL-split; the loop runs to `count - 1` in the original.
        let lines = stdout.components(separatedBy: "\0")
        var files: [CommittedFileChange] = []
        var index = 0
        while index < lines.count - 1 {
            let line = lines[index]
            if line.hasPrefix(":") {
                let comps = line.components(separatedBy: " ")
                guard comps.count >= 2,
                      let src = comps.first?.dropFirst().description,
                      let dst = comps.dropFirst().first
                else { index += 1; continue }
                let status = comps.last ?? ""
                var oldPath: String? = nil
                let isRenameOrCopy = status.hasPrefix("R") || status.hasPrefix("C")
                if isRenameOrCopy {
                    index += 1
                    if index < lines.count { oldPath = lines[index] }
                }
                index += 1
                guard index < lines.count else { break }
                let path = lines[index]
                let appStatus = mapRawStatus(status, oldPath: oldPath, srcMode: String(src), dstMode: String(dst))
                files.append(CommittedFileChange(
                    path: path, status: appStatus,
                    commitish: commitish, parentCommitish: parentCommitish))
            } else if !line.isEmpty {
                // numstat line: `<added>\t<deleted>\t` — merges line counts
                // into the previously parsed file; pure line-count data which
                // Task 1 does not retain (no line-count field in the model).
                // Consumed here so indices stay aligned with the original.
                break
            }
            index += 1
        }
        return files
    }
}
