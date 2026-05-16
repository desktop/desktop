import assert from 'node:assert'
import { afterEach, beforeEach, describe, it } from 'node:test'
import * as React from 'react'

import {
  getAutomaticallyUseSystemGitForOAuthAppAccessRestrictions,
  setAutomaticallyUseSystemGitForOAuthAppAccessRestrictions,
} from '../../../src/lib/oauth-app-access-restrictions'
import { GitErrorContext } from '../../../src/lib/git-error-context'
import { GitHubRepository } from '../../../src/models/github-repository'
import { Owner } from '../../../src/models/owner'
import { Repository } from '../../../src/models/repository'
import { OAuthAppAccessRestrictionDialog } from '../../../src/ui/oauth-app-access-restriction'
import { fireEvent, render, screen, waitFor } from '../../helpers/ui/render'

function repository() {
  const owner = new Owner('kunai-consulting', 'https://api.github.com', 1)
  const ghRepository = new GitHubRepository('pwc-design-system', owner, 1, true)

  return new Repository('/tmp/pwc-design-system', 1, ghRepository, false)
}

const gitArgs = ['pull', '--ff', '--progress', 'origin']

const gitContext: GitErrorContext = {
  kind: 'pull',
  theirBranch: 'origin/main',
  currentBranch: 'main',
}

class TestDispatcher {
  public systemGitCommands = new Array<{
    repository: Repository
    gitArgs: ReadonlyArray<string>
    operation: 'pull' | 'push' | 'fetch'
    gitContext?: GitErrorContext
  }>()

  public async runSystemGitCommandForOAuthAppAccessRestriction(
    repo: Repository,
    args: ReadonlyArray<string>,
    operation: 'pull' | 'push' | 'fetch',
    context?: GitErrorContext
  ) {
    this.systemGitCommands.push({
      repository: repo,
      gitArgs: args,
      operation,
      gitContext: context,
    })
  }
}

let restoreIpcSend: (() => void) | null = null

beforeEach(async () => {
  setAutomaticallyUseSystemGitForOAuthAppAccessRestrictions(false)

  const electron = await import('electron')
  const previousSend = electron.ipcRenderer.send
  electron.ipcRenderer.send = () => {}
  restoreIpcSend = () => {
    electron.ipcRenderer.send = previousSend
    restoreIpcSend = null
  }
})

afterEach(() => {
  restoreIpcSend?.()
})

describe('OAuthAppAccessRestrictionDialog', () => {
  it('lets the user skip future CLI fallback confirmations', async () => {
    const dispatcher = new TestDispatcher()
    let dismissed = 0

    render(
      <OAuthAppAccessRestrictionDialog
        dispatcher={dispatcher as any}
        repository={repository()}
        operation="pull"
        gitArgs={gitArgs}
        gitContext={gitContext}
        onDismissed={() => {
          dismissed++
        }}
      />
    )

    fireEvent.click(screen.getByLabelText('Do not show this message again'))
    fireEvent.click(
      screen.getByRole('button', { name: 'Run git pull', hidden: true })
    )

    await waitFor(() => {
      assert.equal(dispatcher.systemGitCommands.length, 1)
      assert.equal(dismissed, 1)
    })

    assert.equal(
      getAutomaticallyUseSystemGitForOAuthAppAccessRestrictions(),
      true
    )
    assert.deepEqual(dispatcher.systemGitCommands[0].gitArgs, gitArgs)
    assert.equal(dispatcher.systemGitCommands[0].operation, 'pull')
    assert.deepEqual(dispatcher.systemGitCommands[0].gitContext, gitContext)
  })
})
