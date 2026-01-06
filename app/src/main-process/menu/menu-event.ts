export type MenuEvent =
  | 'push'
  | 'force-push'
  | 'pull'
  | 'fetch'
  | 'show-changes'
  | 'show-history'
  | 'add-local-repository'
  | 'create-branch'
  | 'show-branches'
  | 'remove-repository'
  | 'create-repository'
  | 'rename-branch'
  | 'delete-branch'
  | 'discard-all-changes'
  | 'stash-all-changes'
  | 'show-preferences'
  | 'choose-repository'
  | 'open-working-directory'
  | 'update-branch-with-contribution-target-branch'
  | 'compare-to-branch'
  | 'merge-branch'
  | 'squash-and-merge-branch'
  | 'rebase-branch'
  | 'show-repository-settings'
  | 'open-in-shell'
  | 'compare-on-github'
  | 'branch-on-github'
  | 'view-repository-on-github'
  | 'clone-repository'
  | 'show-about'
  | 'go-to-commit-message'
  | 'open-pull-request'
  | 'install-darwin-cli'
  | 'install-windows-cli'
  | 'uninstall-windows-cli'
  | 'open-external-editor'
  | 'select-all'
  | 'show-stashed-changes'
  | 'hide-stashed-changes'
  | 'find-text'
  | 'create-issue-in-repository-on-github'
  | 'preview-pull-request'
  | 'test-app-error'
  | 'decrease-active-resizable-width'
  | 'increase-active-resizable-width'
  | 'toggle-changes-filter'
  | TestMenuEvent

/**
 * This is an alphabetized list of menu event's that are only used for testing
 * UI.
 */
const TestMenuEvents = [
  'boomtown',
  'test-app-error',
  'test-arm64-toast',
  'test-confirm-committing-conflicted-files',
  'test-cherry-pick-conflicts-toast',
  'test-discarded-changes-will-be-unrecoverable',
  'test-do-you-want-fork-this-repository',
  'test-files-too-large',
  'test-generic-git-authentication',
  'test-icons',
  'test-invalidated-account-token',
  'test-merge-successful-toast',
  'test-move-to-application-folder',
  'test-newer-commits-on-remote',
  'test-no-external-editor',
  'test-notification',
  'test-os-version-no-longer-supported',
  'test-prune-branches',
  'test-push-rejected',
  'test-re-authorization-required',
  'test-release-notes-popup',
  'test-reorder-toast',
  'test-showcase-update-toast',
  'test-thank-you-toast',
  'test-thank-you-popup',
  'test-unable-to-locate-git',
  'test-unable-to-open-shell',
  'test-undone-toast',
  'test-untrusted-server',
  'test-update-toast',
  'test-prioritized-update-toast',
  'test-update-existing-git-lfs-filters',
  'test-upstream-already-exists',
  'test-about-dialog',
] as const

export type TestMenuEvent = typeof TestMenuEvents[number]

export function isTestMenuEvent(value: any): value is TestMenuEvent {
  return TestMenuEvents.includes(value)
}
