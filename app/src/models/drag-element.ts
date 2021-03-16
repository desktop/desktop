import { Commit } from './commit'
import { GitHubRepository } from './github-repository'

export enum DragElementType {
  CherryPickCommit,
}

export type DragElement = {
  type: DragElementType.CherryPickCommit
  commit: Commit
  selectedCommits: ReadonlyArray<Commit>
  gitHubRepository: GitHubRepository | null
}
