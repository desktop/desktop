import { User } from '../models/user'
import { Repository } from '../models/repository'
import { Commit, Branch } from './local-git-operations'
import { FileChange, WorkingDirectoryStatus, WorkingDirectoryFileChange } from '../models/status'
import { CloningRepository, ICloningRepositoryState, IGitHubUser } from './dispatcher'

export { ICloningRepositoryState } from './dispatcher'

export enum SelectionType {
  Repository,
  CloningRepository,
}

export type PossibleSelections = { type: SelectionType.Repository, repository: Repository, state: IRepositoryState } |
                                 { type: SelectionType.CloningRepository, repository: CloningRepository, state: ICloningRepositoryState }

/** All of the shared app state. */
export interface IAppState {
  readonly users: ReadonlyArray<User>
  readonly repositories: ReadonlyArray<Repository | CloningRepository>

  readonly selectedState: PossibleSelections | null

  readonly loading: boolean
  readonly currentPopup: Popup | null

  readonly errors: ReadonlyArray<IAppError>

  /** Map from the emoji shortcut (e.g., :+1:) to the image's local path. */
  readonly emoji: Map<string, string>
}

export interface IAppError {
  /** The name of the error. This is for application use only. */
  readonly name: string

  /** The user-facing message. */
  readonly message: string
}

export enum PopupType {
  CreateBranch = 1,
  ShowBranches,
  AddRepository,
  RenameBranch,
  PublishRepository,
  DeleteBranch,
  ConfirmDiscardChanges,
}

export type Popup = { type: PopupType.CreateBranch, repository: Repository } |
                    { type: PopupType.ShowBranches, repository: Repository } |
                    { type: PopupType.AddRepository } |
                    { type: PopupType.RenameBranch, repository: Repository, branch: Branch } |
                    { type: PopupType.PublishRepository, repository: Repository } |
                    { type: PopupType.DeleteBranch, repository: Repository, branch: Branch } |
                    { type: PopupType.ConfirmDiscardChanges, repository: Repository, files: ReadonlyArray<WorkingDirectoryFileChange> }

export enum RepositorySection {
  Changes,
  History
}

export interface IRepositoryState {
  readonly historyState: IHistoryState
  readonly changesState: IChangesState
  readonly selectedSection: RepositorySection

  /**
   * The value which will be used as the email when committing
   * barring any race where user.email is updated between us
   * reading it and a commit being made (ie we don't currently use
   * this value explicitly when committing)
   */
  readonly authorEmail: string | null

  /**
   * The value which will be used as the name when committing
   * barring any race where user.name  is updated between us
   * reading it and a commit being made (ie we don't currently use
   * this value explicitly when committing)
   */
  readonly authorName: string | null
  readonly branchesState: IBranchesState

  /**
   * Mapping from lowercased email addresses to the associated GitHub user. Note
   * that an email address may not have an associated GitHub user, or the user
   * may still be loading.
   */
  readonly gitHubUsers: Map<string, IGitHubUser>

  /** The commits loaded, keyed by their full SHA. */
  readonly commits: Map<string, Commit>
}

export interface IBranchesState {
  readonly currentBranch: Branch | null
  readonly defaultBranch: Branch | null
  readonly allBranches: ReadonlyArray<Branch>
  readonly recentBranches: ReadonlyArray<Branch>
}

export interface IHistorySelection {
  readonly sha: string | null
  readonly file: FileChange | null
}

export interface IHistoryState {
  readonly selection: IHistorySelection

  /** The ordered SHAs. */
  readonly history: ReadonlyArray<string>

  readonly changedFiles: ReadonlyArray<FileChange>
}

export interface IChangesState {
  readonly workingDirectory: WorkingDirectoryStatus
  readonly selectedFile: WorkingDirectoryFileChange | null
}
