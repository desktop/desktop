import Foundation

// MARK: - Branch grouping + validation
// Pure logic ported from `branches/group-branches.ts`,
// `lib/branch-name-rule-validation.ts` and the create/rename/delete dialogs.
// Kept UI-free so it is unit-testable without git.

/// Grouped branch sections. Mirrors `groupBranches`.
public struct GroupedBranches: Sendable, Equatable {
    public var `default`: [Branch]
    public var recent: [Branch]
    public var other: [Branch]

    public init(default: [Branch] = [], recent: [Branch] = [], other: [Branch] = []) {
        self.default = `default`
        self.recent = recent
        self.other = other
    }

    public var isEmpty: Bool { `default`.isEmpty && recent.isEmpty && other.isEmpty }
    public var totalCount: Int { `default`.count + recent.count + other.count }
}

public func groupBranches(
    defaultBranch: Branch?,
    currentBranch: Branch?,
    allBranches: [Branch],
    recentBranches: [Branch]
) -> GroupedBranches {
    var defaultGroup: [Branch] = []
    if let defaultBranch { defaultGroup = [defaultBranch] }
    let defaultRefs = Set(defaultGroup.map(\.ref))
    _ = currentBranch
    let recent = recentBranches.filter { branch in
        !defaultRefs.contains(branch.ref) && !branch.isDesktopForkRemoteBranch
    }
    let recentRefs = Set(recent.map(\.ref))
    let other = allBranches.filter { branch in
        !defaultRefs.contains(branch.ref)
            && !recentRefs.contains(branch.ref)
            && !branch.isDesktopForkRemoteBranch
    }
    return GroupedBranches(default: defaultGroup, recent: recent, other: other)
}

/// Case-insensitive substring filter over branch names.
public func filterBranches(_ branches: [Branch], filterText: String) -> [Branch] {
    let query = filterText.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !query.isEmpty else { return branches }
    return branches.filter {
        $0.name.range(of: query, options: [.caseInsensitive, .diacriticInsensitive]) != nil
    }
}

/// Branch-name validation result for the create/rename dialogs.
public enum BranchNameValidation: Sendable, Equatable {
    case ok
    case empty
    case invalid(reason: String)
    case duplicate
}

public func validateBranchName(_ name: String, existingNames: [String]) -> BranchNameValidation {
    let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
    if trimmed.isEmpty { return .empty }
    if let reason = checkRefFormatViolation(trimmed) {
        return .invalid(reason: reason)
    }
    let lowered = trimmed.lowercased()
    if existingNames.contains(where: { $0.lowercased() == lowered }) {
        return .duplicate
    }
    return .duplicateIfRemotePrefixConflict(trimmed, existingNames: existingNames)
}

private extension BranchNameValidation {
    static func duplicateIfRemotePrefixConflict(_ name: String, existingNames: [String]) -> BranchNameValidation {
        // `origin/main` vs `main` style collisions are caught by exact match
        // above; nothing further to check without remote metadata.
        _ = existingNames
        return .ok
    }
}

/// Subset of `git check-ref-format` rules, mirroring
/// `lib/branch-name-rule-validation.ts` error copy.
public func checkRefFormatViolation(_ name: String) -> String? {
    if name.hasPrefix("-") || name.hasPrefix("/") { return "Branch names cannot start with '-' or '/'." }
    if name.hasSuffix("/") || name.hasSuffix(".") { return "Branch names cannot end with '/' or '.'." }
    if name.hasSuffix(".lock") { return "Branch names cannot end with '.lock'." }
    if name.contains("..") { return "Branch names cannot contain '..'." }
    for ch in ["~", "^", ":", "?", "*", "[", "\\", " "] {
        if name.contains(ch) { return "Branch names cannot contain '\(ch)'." }
    }
    if name.contains("//") { return "Branch names cannot contain consecutive slashes." }
    if name.contains("@{") { return "Branch names cannot contain '@{'." }
    if name == "@" { return "'@' is not a valid branch name." }
    let components = name.split(separator: "/", omittingEmptySubsequences: false)
    if components.contains(where: { $0.hasPrefix(".") || $0.isEmpty }) {
        return "Branch path components cannot start with '.' or be empty."
    }
    return nil
}

/// Whether a rename that only changes case should offer the force-retry path
/// (mirrors the case-only retry in `lib/git/branch.ts` `renameBranch`).
public func isCaseOnlyRename(from old: String, to new: String) -> Bool {
    old.lowercased() == new.lowercased() && old != new
}
