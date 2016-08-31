import User from '../models/user'
import Repository from '../models/repository'
import { Commit, Branch } from './local-git-operations'
import { FileChange, WorkingDirectoryStatus, WorkingDirectoryFileChange } from '../models/status'
import { CloningRepository, ICloningRepositoryState } from './dispatcher'

export { ICloningRepositoryState } from './dispatcher'

export type PossibleSelections = { kind: 'repository', repository: Repository, state: IRepositoryState } |
                                 { kind: 'cloning-repository', repository: CloningRepository, state: ICloningRepositoryState }

/** All of the shared app state. */
export interface IAppState {
  readonly users: ReadonlyArray<User>
  readonly repositories: ReadonlyArray<Repository | CloningRepository>

  readonly selectedState: PossibleSelections | null

  readonly loading: boolean
  readonly currentPopup: Popup | null

  readonly errors: ReadonlyArray<IAppError>
}

export interface IAppError {
  /** The name of the error. This is for application use only. */
  readonly name: string

  /** The user-facing message. */
  readonly message: string
}

export enum Popup {
  CreateBranch = 1,
  ShowBranches,
  AddRepository,
  RenameBranch,
  PublishRepository,
  DeleteBranch,
}

export enum RepositorySection {
  Changes,
  History
}

export interface IRepositoryState {
  readonly historyState: IHistoryState
  readonly changesState: IChangesState
  readonly selectedSection: RepositorySection
  readonly committerEmail: string | null
  readonly branchesState: IBranchesState
}

export interface IBranchesState {
  readonly currentBranch: Branch | null
  readonly defaultBranch: Branch | null
  readonly allBranches: ReadonlyArray<Branch>
  readonly recentBranches: ReadonlyArray<Branch>

  /** The commits loaded, keyed by their full SHA. */
  readonly commits: Map<string, Commit>
}

export interface IHistorySelection {
  readonly commit: Commit | null
  readonly file: FileChange | null
}

export interface IHistoryState {
  readonly selection: IHistorySelection
  readonly commits: ReadonlyArray<Commit>
  readonly commitCount: number
  readonly loading: boolean

  readonly changedFiles: ReadonlyArray<FileChange>
}

export interface IChangesState {
  readonly workingDirectory: WorkingDirectoryStatus
  readonly selectedFile: WorkingDirectoryFileChange | null
}
