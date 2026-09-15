import Foundation

// MARK: - Banner
// Pruned port of `electron/app/src/models/banner.ts`.
// `OpenThankYouCard` is omitted (GitHub marketing surface).
// The original stores render callbacks (`onUndo`, `onOpenDialog`, …) inside
// banner values. Those become `actionToken`s here: Task 2's BannerHost maps a
// token back to an `AppStore` action, keeping this model layer value-typed
// and testable.

public enum BannerType: String, Codable, Sendable {
    case successfulMerge
    case mergeConflictsFound
    case successfulRebase
    case rebaseConflictsFound
    case branchAlreadyUpToDate
    case successfulCherryPick
    case cherryPickConflictsFound
    case cherryPickUndone
    case squashUndone
    case reorderUndone
    case successfulSquash
    case successfulReorder
    case conflictsFound
    case osVersionNoLongerSupported
}

public enum Banner: Sendable, Equatable {
    case successfulMerge(ourBranch: String, theirBranch: String?)
    case mergeConflictsFound(ourBranch: String, popup: Popup)
    case successfulRebase(targetBranch: String, baseBranch: String?)
    case rebaseConflictsFound(targetBranch: String, actionToken: UUID)
    case branchAlreadyUpToDate(ourBranch: String, theirBranch: String?)
    case successfulCherryPick(targetBranchName: String, count: Int, actionToken: UUID)
    case cherryPickConflictsFound(targetBranchName: String, actionToken: UUID)
    case cherryPickUndone(targetBranchName: String, countCherryPicked: Int)
    case successfulSquash(count: Int, actionToken: UUID)
    case squashUndone(commitsCount: Int)
    case successfulReorder(count: Int, actionToken: UUID)
    case reorderUndone(commitsCount: Int)
    case conflictsFound(operationDescription: String, actionToken: UUID)
    case osVersionNoLongerSupported

    public var type: BannerType {
        switch self {
        case .successfulMerge: return .successfulMerge
        case .mergeConflictsFound: return .mergeConflictsFound
        case .successfulRebase: return .successfulRebase
        case .rebaseConflictsFound: return .rebaseConflictsFound
        case .branchAlreadyUpToDate: return .branchAlreadyUpToDate
        case .successfulCherryPick: return .successfulCherryPick
        case .cherryPickConflictsFound: return .cherryPickConflictsFound
        case .cherryPickUndone: return .cherryPickUndone
        case .successfulSquash: return .successfulSquash
        case .squashUndone: return .squashUndone
        case .successfulReorder: return .successfulReorder
        case .reorderUndone: return .reorderUndone
        case .conflictsFound: return .conflictsFound
        case .osVersionNoLongerSupported: return .osVersionNoLongerSupported
        }
    }
}
