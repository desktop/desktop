import User from '../models/user'
import Repository from '../models/repository'
import { Commit } from './local-git-operations'
import { FileChange, WorkingDirectoryStatus } from '../models/status'

/** All of the shared app state. */
export interface IAppState {
  readonly users: ReadonlyArray<User>
  readonly repositories: ReadonlyArray<Repository>
  readonly selectedRepository: Repository | null

  readonly repositoryState: IRepositoryState | null
}

export enum RepositorySection {
  Changes,
  History
}

export interface IRepositoryState {
  readonly historyState: IHistoryState
  readonly changesState: IChangesState
  readonly selectedSection: RepositorySection
}

export interface IHistorySelection {
  readonly commit: Commit | null
  readonly file: FileChange | null
}

export interface IHistoryState {
  readonly selection: IHistorySelection
  readonly commits: ReadonlyArray<Commit>
  readonly changedFiles: ReadonlyArray<FileChange>
}

export interface IChangesState {
  readonly workingDirectory: WorkingDirectoryStatus
  readonly selectedPath: string | null
}
