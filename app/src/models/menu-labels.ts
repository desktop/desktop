export type MenuLabelsEvent = {
  readonly editorLabel?: string
  readonly shellLabel?: string
  readonly pullRequestLabel?: string
  readonly defaultBranchName?: string
  readonly isForcePushForCurrentRepository?: boolean
  readonly askForConfirmationOnForcePush?: boolean
  readonly askForConfirmationOnRepositoryRemoval?: boolean
  readonly isStashedChangesVisible?: boolean
}
