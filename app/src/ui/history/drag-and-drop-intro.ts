/** Type of the drag and drop intro popover. Each value represents a feature. */
export enum DragAndDropIntroType {
  CherryPick = 'cherry-pick',
  Squash = 'squash',
  Reorder = 'reorder',
}

/** Structure to describe the drag and drop intro popover. */
export type DragAndDropIntro = {
  readonly title: string
  readonly body: string
}

/** List of all available drag and drop intro types. */
export const AvailableDragAndDropIntroKeys = Object.values(
  DragAndDropIntroType
) as ReadonlyArray<DragAndDropIntroType>

/** Map with all available drag and drop intros. */
export const AvailableDragAndDropIntros: Record<
  DragAndDropIntroType,
  DragAndDropIntro
> = {
  [DragAndDropIntroType.CherryPick]: {
    title: 'Drag and drop to cherry-pick!',
    body:
      'Copy commits to another branch by dragging and dropping them onto a branch in the branch menu, or by right-clicking on a commit.',
  },
  [DragAndDropIntroType.Squash]: {
    title: 'Drag and drop to squash!',
    body:
      'Squash commits by dragging and dropping them onto another commit, or by right-clicking on multiple commits.',
  },
  [DragAndDropIntroType.Reorder]: {
    title: 'Drag and drop to reorder!',
    body:
      'Reorder commits to tidy up your history by dragging and dropping them to a different position.',
  },
}
