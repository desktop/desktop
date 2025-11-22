export enum ForkContributionTarget {
  Parent = 'parent',
  Self = 'self',
}
export type ExternalEditorPreference =
  | { kind: 'inherit' }
  | { kind: 'editor'; editor: string }

/**
 * Collection of configurable settings regarding how the user may work with a repository.
 */
export type WorkflowPreferences = {
  /**
   * What repo does the user want to contribute to with this fork?
   */
  readonly forkContributionTarget?: ForkContributionTarget

  /**
   * What editor does the user want to use for this repository?
   */
  readonly externalEditor?: ExternalEditorPreference
}

/**
 * Gets the per-repository external editor from repository WorkFlowPreferences,
 * or returns the globally chosen editor
 */
export function getRepositoryExternalEditor(
  preferences: WorkflowPreferences | undefined,
  globalEditor: string | null
): string | null {
  const editorPreference = preferences?.externalEditor
  if (editorPreference?.kind === 'editor') {
    return editorPreference.editor
  }
  return globalEditor
}
