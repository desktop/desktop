import { RowIndexPath } from '../ui/lib/list/list-row-index-path'
import { Commit } from './commit'
import { GitHubRepository } from './github-repository'

/**
 * This is a type is used in conjunction with the drag and drop manager to
 * store and specify the types of data that are being dragged
 *
 * Thus, using a `|` here would allow us to specify multiple types of data that
 * can be dragged.
 */
export type DragData = CommitDragData

export type CommitDragData = {
  type: DragType.Commit
  commits: ReadonlyArray<Commit>
}

export enum DragType {
  Commit,
}

export type DragElement = {
  type: DragType.Commit
  commit: Commit
  selectedCommits: ReadonlyArray<Commit>
  gitHubRepository: GitHubRepository | null
}

export enum DropTargetType {
  Branch,
  Commit,
  ListInsertionPoint,
}

export enum DropTargetSelector {
  Branch = '.branches-list-item',
  PullRequest = '.pull-request-item',
  Commit = '.commit',
  ListInsertionPoint = '.list-insertion-point',
}

export type BranchTarget = {
  type: DropTargetType.Branch
  branchName: string
}

export type CommitTarget = {
  type: DropTargetType.Commit
}

export type ListInsertionPointTarget = {
  type: DropTargetType.ListInsertionPoint
  data: DragData
  index: RowIndexPath
}

/**
 * This is a type is used in conjunction with the drag and drop manager to
 * pass information about a drop target.
 */
export type DropTarget = BranchTarget | CommitTarget | ListInsertionPointTarget
