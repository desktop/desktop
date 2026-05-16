import { beforeEach, describe, it } from 'node:test'
import assert from 'node:assert'

import { GitError as DugiteError } from 'dugite'

import { GitError, IGitStringResult } from '../../../src/lib/git/core'
import { ErrorWithMetadata } from '../../../src/lib/error-with-metadata'
import { setAutomaticallyUseSystemGitForOAuthAppAccessRestrictions } from '../../../src/lib/oauth-app-access-restrictions'
import { Repository } from '../../../src/models/repository'
import { GitHubRepository } from '../../../src/models/github-repository'
import { Owner } from '../../../src/models/owner'
import { Popup, PopupType } from '../../../src/models/popup'
import { RetryActionType } from '../../../src/models/retry-actions'
import { GitErrorContext } from '../../../src/lib/git-error-context'
import {
  localChangesOverwrittenHandler,
  oauthAppAccessRestrictionHandler,
  rebaseConflictsHandler,
} from '../../../src/ui/dispatcher/error-handlers'

const gitArgs = [
  '-c',
  'rebase.backend=merge',
  'pull',
  '--ff',
  '--recurse-submodules',
  '--progress',
  'origin',
]

const fetchGitArgs = [
  'fetch',
  '--progress',
  '--prune',
  '--recurse-submodules=on-demand',
  'origin',
]

beforeEach(() => {
  setAutomaticallyUseSystemGitForOAuthAppAccessRestrictions(false)
})

function repository() {
  const owner = new Owner('blocked-org', 'https://api.github.com', 1)
  const ghRepository = new GitHubRepository('private-repo', owner, 1, true)

  return new Repository('/tmp/private-repo', 1, ghRepository, false)
}

function repositoryNotFoundGitError(args: ReadonlyArray<string> = gitArgs) {
  const result = {
    exitCode: 1,
    stdout: '',
    stderr:
      "remote: Repository not found.\nfatal: repository 'https://github.com/blocked-org/private-repo.git/' not found",
    gitError: DugiteError.HTTPSRepositoryNotFound,
    gitErrorDescription:
      'The repository does not seem to exist anymore. You may not have access, or it may have been deleted or renamed.',
    path: '/tmp/private-repo',
  } as IGitStringResult

  return new GitError(result, [...args], result.stderr)
}

const pullGitContext: GitErrorContext = {
  kind: 'pull',
  theirBranch: 'origin/main',
  currentBranch: 'main',
}

function metadataError(gitContext?: GitErrorContext) {
  const repo = repository()

  return new ErrorWithMetadata(repositoryNotFoundGitError(), {
    repository: repo,
    retryAction: { type: RetryActionType.Pull, repository: repo },
    gitContext,
  })
}

function fetchMetadataError() {
  const repo = repository()

  return new ErrorWithMetadata(repositoryNotFoundGitError(fetchGitArgs), {
    repository: repo,
    retryAction: { type: RetryActionType.Fetch, repository: repo },
  })
}

function localChangesOverwrittenError() {
  const result = {
    exitCode: 1,
    stdout: '',
    stderr: `error: Your local changes to the following files would be overwritten by merge:
        docs/src/components/dashboard.tsx
        docs/src/global.css
        docs/src/routes/(docs)/layout.tsx
        docs/src/routes/(docs)/sidebar/index.tsx
        docs/vite.config.ts
Please commit your changes or stash them before you merge.
Aborting
Updating e8bb3d9..84bee9d`,
    gitError: DugiteError.MergeWithLocalChanges,
    gitErrorDescription:
      'Your local changes to the following files would be overwritten by merge.',
    path: '/tmp/private-repo',
  } as IGitStringResult

  return new GitError(result, gitArgs, result.stderr)
}

function rebaseConflictsError() {
  const result = {
    exitCode: 1,
    stdout: '',
    stderr:
      'CONFLICT (content): Merge conflict in README.md\nerror: could not apply abc123... change README',
    gitError: DugiteError.RebaseConflicts,
    gitErrorDescription: 'A rebase conflict occurred.',
    path: '/tmp/private-repo',
  } as IGitStringResult

  return new GitError(result, gitArgs, result.stderr)
}

describe('oauthAppAccessRestrictionHandler', () => {
  it('shows a CLI fallback confirmation for confirmed OAuth App restrictions', async () => {
    const popups = new Array<Popup>()
    const error = metadataError()

    const result = await oauthAppAccessRestrictionHandler(error, {
      isRepositoryBlockedByOAuthAppAccessRestrictions: async () => true,
      showPopup: async (p: Popup) => {
        popups.push(p)
      },
    } as any)

    assert.equal(result, null)
    assert.equal(popups.length, 1)

    const oauthPopup = popups[0] as Extract<
      Popup,
      { type: PopupType.OAuthAppAccessRestriction }
    >
    assert.equal(oauthPopup.type, PopupType.OAuthAppAccessRestriction)
    assert.deepEqual(oauthPopup.gitArgs, gitArgs)
    assert.equal(oauthPopup.operation, 'pull')
  })

  it('preserves pull context for system git rebase conflict handling', async () => {
    const popups = new Array<Popup>()
    const error = metadataError(pullGitContext)

    const result = await oauthAppAccessRestrictionHandler(error, {
      isRepositoryBlockedByOAuthAppAccessRestrictions: async () => true,
      showPopup: async (p: Popup) => {
        popups.push(p)
      },
    } as any)

    assert.equal(result, null)
    assert.equal(popups.length, 1)

    const oauthPopup = popups[0] as Extract<
      Popup,
      { type: PopupType.OAuthAppAccessRestriction }
    >
    assert.deepEqual(oauthPopup.gitContext, pullGitContext)
  })

  it('shows a CLI fallback confirmation for confirmed OAuth App restrictions during fetch', async () => {
    const popups = new Array<Popup>()
    const error = fetchMetadataError()

    const result = await oauthAppAccessRestrictionHandler(error, {
      isRepositoryBlockedByOAuthAppAccessRestrictions: async () => true,
      showPopup: async (p: Popup) => {
        popups.push(p)
      },
    } as any)

    assert.equal(result, null)
    assert.equal(popups.length, 1)

    const oauthPopup = popups[0] as Extract<
      Popup,
      { type: PopupType.OAuthAppAccessRestriction }
    >
    assert.equal(oauthPopup.type, PopupType.OAuthAppAccessRestriction)
    assert.deepEqual(oauthPopup.gitArgs, fetchGitArgs)
    assert.equal(oauthPopup.operation, 'fetch')
  })

  it('runs system Git without confirmation when the automatic fallback setting is enabled', async () => {
    const popups = new Array<Popup>()
    const systemGitCommands = new Array<{
      repository: Repository
      gitArgs: ReadonlyArray<string>
      operation: 'pull' | 'push' | 'fetch'
      gitContext?: GitErrorContext
    }>()
    const error = metadataError(pullGitContext)
    setAutomaticallyUseSystemGitForOAuthAppAccessRestrictions(true)

    const result = await oauthAppAccessRestrictionHandler(error, {
      isRepositoryBlockedByOAuthAppAccessRestrictions: async () => true,
      showPopup: async (p: Popup) => {
        popups.push(p)
      },
      runSystemGitCommandForOAuthAppAccessRestriction: async (
        repo: Repository,
        args: ReadonlyArray<string>,
        op: 'pull' | 'push' | 'fetch',
        context?: GitErrorContext
      ) => {
        systemGitCommands.push({
          repository: repo,
          gitArgs: args,
          operation: op,
          gitContext: context,
        })
      },
    } as any)

    assert.equal(result, null)
    assert.equal(popups.length, 0)
    assert.equal(systemGitCommands.length, 1)
    assert.deepEqual(systemGitCommands[0].gitArgs, gitArgs)
    assert.equal(systemGitCommands[0].operation, 'pull')
    assert.deepEqual(systemGitCommands[0].gitContext, pullGitContext)
  })

  it('leaves ordinary repository-not-found errors to the default handler', async () => {
    const popups = new Array<Popup>()
    const error = metadataError()

    const result = await oauthAppAccessRestrictionHandler(error, {
      isRepositoryBlockedByOAuthAppAccessRestrictions: async () => false,
      showPopup: async (p: Popup) => {
        popups.push(p)
      },
    } as any)

    assert.equal(result, error)
    assert.equal(popups.length, 0)
  })
})

describe('localChangesOverwrittenHandler', () => {
  it('shows the stash-and-retry dialog for system git fallback pull failures', async () => {
    const repo = repository()
    const popups = new Array<Popup>()
    const retryAction = {
      type: RetryActionType.SystemGitCommand as const,
      repository: repo,
      gitArgs,
      operation: 'pull' as const,
    }

    const error = new ErrorWithMetadata(localChangesOverwrittenError(), {
      repository: repo,
      retryAction,
    })

    const result = await localChangesOverwrittenHandler(error, {
      showPopup: async (p: Popup) => {
        popups.push(p)
      },
    } as any)

    assert.equal(result, null)
    assert.equal(popups.length, 1)

    const localChangesPopup = popups[0] as Extract<
      Popup,
      { type: PopupType.LocalChangesOverwritten }
    >
    assert.equal(localChangesPopup.type, PopupType.LocalChangesOverwritten)
    assert.equal(localChangesPopup.retryAction, retryAction)
    assert.deepStrictEqual(localChangesPopup.files, [
      'docs/src/components/dashboard.tsx',
      'docs/src/global.css',
      'docs/src/routes/(docs)/layout.tsx',
      'docs/src/routes/(docs)/sidebar/index.tsx',
      'docs/vite.config.ts',
    ])
  })
})

describe('rebaseConflictsHandler', () => {
  it('routes system git fallback rebase conflicts through the GUI rebase flow', async () => {
    const repo = repository()
    const launchedRebases = new Array<{
      repository: Repository
      branch: string
    }>()
    const retryAction = {
      type: RetryActionType.SystemGitCommand as const,
      repository: repo,
      gitArgs,
      operation: 'pull' as const,
      gitContext: pullGitContext,
    }

    const error = new ErrorWithMetadata(rebaseConflictsError(), {
      repository: repo,
      retryAction,
      gitContext: pullGitContext,
    })

    const result = await rebaseConflictsHandler(error, {
      launchRebaseOperation: (repository: Repository, branch: string) => {
        launchedRebases.push({ repository, branch })
      },
    } as any)

    assert.equal(result, null)
    assert.deepStrictEqual(launchedRebases, [
      { repository: repo, branch: 'main' },
    ])
  })
})
