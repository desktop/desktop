export type MenuLabelsEvent = {
  readonly editorLabel?: string
  readonly shellLabel?: string
  readonly defaultBranchName?: string
  readonly isForcePushForCurrentRepository?: boolean
  readonly askForConfirmationOnForcePush?: boolean
  readonly askForConfirmationOnRepositoryRemoval?: boolean
  readonly hasCurrentPullRequest?: boolean
  readonly isStashedChangesVisible?: boolean
}
