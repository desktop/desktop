export type MenuLabelsEvent = {
  readonly editorLabel?: string
  readonly shellLabel?: string
  readonly pullRequestLabel?: string
  readonly defaultBranchName?: string
  readonly removeRepoLabel?: string
  readonly isForcePushForCurrentRepository?: boolean
  readonly askForConfirmationOnForcePush?: boolean
  readonly isStashedChangesVisible?: boolean
}
