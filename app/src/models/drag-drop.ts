import { Commit } from './commit'
import { GitHubRepository } from './github-repository'

/**
 * This is a type is used in conjunction with the drag and drop manager to to
 * store and specify the types of data that are being dragged
 *
 * Thus, using a `|` here would allow us to specify multiple types of data that
 * can be dragged.
 */
export type DragData = ReadonlyArray<Commit>

export enum DragElementType {
  Commit,
}

export type DragElement = {
  type: DragElementType.Commit
  commit: Commit
  selectedCommits: ReadonlyArray<Commit>
  gitHubRepository: GitHubRepository | null
}
