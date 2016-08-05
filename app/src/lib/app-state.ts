import User from '../models/user'
import Repository from '../models/repository'
import { Commit } from './local-git-operations'
import { FileChange, WorkingDirectoryStatus, WorkingDirectoryFileChange } from '../models/status'

/** All of the shared app state. */
export interface IAppState {
  readonly users: ReadonlyArray<User>
  readonly repositories: ReadonlyArray<Repository>

  readonly selectedRepository: Repository | null
  readonly repositoryState: IRepositoryState | null

  readonly currentPopup: Popup | null
}

export enum Popup {
  CreateBranch = 1
}

export enum RepositorySection {
  Changes,
  History
}

export interface IRepositoryState {
  readonly historyState: IHistoryState
  readonly changesState: IChangesState
  readonly selectedSection: RepositorySection
  readonly currentBranch: string | null
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
