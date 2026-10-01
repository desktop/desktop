import assert from 'node:assert'
import { afterEach, describe, it } from 'node:test'
import * as React from 'react'

import { Account } from '../../../src/models/account'
import { DefaultCommitMessage } from '../../../src/models/commit-message'
import { Commit } from '../../../src/models/commit'
import { CommitIdentity } from '../../../src/models/commit-identity'
import { DiffSelection, DiffSelectionType } from '../../../src/models/diff'
import { GitHubRepository } from '../../../src/models/github-repository'
import { Owner } from '../../../src/models/owner'
import { RepoRulesInfo } from '../../../src/models/repo-rules'
import { Repository } from '../../../src/models/repository'
import {
  AppFileStatusKind,
  WorkingDirectoryFileChange,
} from '../../../src/models/status'
import { CommitMessage } from '../../../src/ui/changes/commit-message'
import { fireEvent, render, screen } from '../../helpers/ui/render'

const PreviewFeaturesEnv = 'GITHUB_DESKTOP_PREVIEW_FEATURES'
const previousPreviewFeatures = process.env[PreviewFeaturesEnv]

type CommitMessageProps = React.ComponentProps<typeof CommitMessage>
type CopilotButtonProps = {
  readonly ariaLabel?: string
  readonly disabled?: boolean
}

type CommitMessageTestInstance = {
  readonly renderCopilotButton: () => React.ReactElement | null
  readonly onCopilotButtonClick: (
    event: Pick<React.MouseEvent<HTMLButtonElement>, 'preventDefault'>
  ) => Promise<void>
}

function createAccount() {
  return new Account(
    'mona',
    'https://api.github.com',
    'token',
    [],
    '',
    1,
    'Mona Lisa',
    'free',
    'https://copilot-proxy.githubusercontent.com',
    true,
    ['desktop_copilot_generate_commit_message']
  )
}

function createRepository() {
  const owner = new Owner('octocat', 'https://api.github.com', 1)
  const gitHubRepository = new GitHubRepository(
    'desktop',
    owner,
    99,
    false,
    'https://github.com/octocat/desktop'
  )

  return new Repository('/tmp/desktop-fixture', 123, gitHubRepository, false)
}

function createSelectedFile(path: string) {
  return new WorkingDirectoryFileChange(
    path,
    { kind: AppFileStatusKind.Modified },
    DiffSelection.fromInitialSelection(DiffSelectionType.All)
  )
}

function createProps(
  overrides: Partial<CommitMessageProps> = {}
): CommitMessageProps {
  const account = createAccount()
  const repository = createRepository()
  const filesSelected = [createSelectedFile('src/index.ts')]

  return {
    onCreateCommit: async () => false,
    branch: 'main',
    commitAuthor: null,
    anyFilesSelected: true,
    filesToBeCommittedCount: filesSelected.length,
    showPromptForCommittingFileHiddenByFilter: false,
    isShowingModal: false,
    isShowingFoldout: false,
    anyFilesAvailable: true,
    filesSelected,
    focusCommitMessage: false,
    commitMessage: DefaultCommitMessage,
    repository,
    repositoryAccount: null,
    autocompletionProviders: [],
    isCommitting: false,
    hookProgress: null,
    onShowCommitProgress: undefined,
    isGeneratingCommitMessage: true,
    shouldShowGenerateCommitMessageCallOut: false,
    commitToAmend: null,
    placeholder: 'Summary',
    prepopulateCommitSummary: false,
    showBranchProtected: false,
    repoRulesInfo: new RepoRulesInfo(),
    aheadBehind: null,
    showNoWriteAccess: false,
    showCoAuthoredBy: false,
    showInputLabels: false,
    coAuthors: [],
    shouldNudge: false,
    commitSpellcheckEnabled: false,
    showCommitLengthWarning: false,
    mostRecentLocalCommit: null,
    onCoAuthorsUpdated: () => {},
    onShowCoAuthoredByChanged: () => {},
    onConfirmCommitWithUnknownCoAuthors: () => {},
    onGenerateCommitMessage: () => {},
    onCancelGenerateCommitMessage: () => {},
    onCommitMessageFocusSet: () => {},
    onRefreshAuthor: () => {},
    onShowPopup: () => {},
    onShowFoldout: () => {},
    onCommitSpellcheckEnabledChanged: () => {},
    onStopAmending: () => {},
    onShowCreateForkDialog: () => {},
    accounts: [account],
    skipCommitHooks: false,
    signOffCommits: false,
    allowEmptyCommit: false,
    showAllowEmptyCommitOption: true,
    onUpdateCommitOptions: () => {},
    ...overrides,
  }
}

function toTestInstance(component: CommitMessage): CommitMessageTestInstance {
  return component as unknown as CommitMessageTestInstance
}

function isElementWithCopilotButtonProps(
  node: React.ReactNode
): node is React.ReactElement<
  CopilotButtonProps & { readonly className?: string }
> {
  return React.isValidElement(node) && node.props.className === 'copilot-button'
}

function getCopilotButtonProps(
  component: CommitMessageTestInstance
): CopilotButtonProps {
  const button = component.renderCopilotButton()
  if (button === null) {
    throw new Error('Expected Copilot button to render')
  }

  const buttonElement = React.Children.toArray(button.props.children).find(
    isElementWithCopilotButtonProps
  )
  if (buttonElement === undefined) {
    throw new Error('Expected Copilot button element to render')
  }

  return buttonElement.props
}

async function clickCopilotButton(component: CommitMessageTestInstance) {
  await component.onCopilotButtonClick({
    preventDefault: () => {},
  })
}

afterEach(() => {
  localStorage.removeItem('commit-mode')

  if (previousPreviewFeatures === undefined) {
    delete process.env[PreviewFeaturesEnv]
  } else {
    process.env[PreviewFeaturesEnv] = previousPreviewFeatures
  }
})

describe('CommitMessage', () => {
  it('does not allow cancelling commit message generation when the Copilot SDK is disabled', async () => {
    delete process.env[PreviewFeaturesEnv]

    let cancelCount = 0
    const component = toTestInstance(
      new CommitMessage(
        createProps({
          onCancelGenerateCommitMessage: () => {
            cancelCount++
          },
        })
      )
    )

    const buttonProps = getCopilotButtonProps(component)

    assert.equal(buttonProps.ariaLabel, 'Generating commit details…')
    assert.equal(buttonProps.disabled, true)

    await clickCopilotButton(component)

    assert.equal(cancelCount, 0)
  })

  it('allows cancelling commit message generation when the Copilot SDK is enabled', async () => {
    process.env[PreviewFeaturesEnv] = '1'

    let cancelCount = 0
    const component = toTestInstance(
      new CommitMessage(
        createProps({
          onCancelGenerateCommitMessage: () => {
            cancelCount++
          },
        })
      )
    )

    const buttonProps = getCopilotButtonProps(component)

    assert.equal(buttonProps.ariaLabel, 'Cancel generating commit details')
    assert.equal(buttonProps.disabled, false)

    await clickCopilotButton(component)

    assert.equal(cancelCount, 1)
  })

  describe('commit modes', () => {
    /**
     * Rendering the component reads the repository's Git config, so it must
     * point to an existing Git repository. The working directory of the test
     * runner is the Desktop repository itself, which is only read from.
     */
    function createMountableRepository() {
      const { gitHubRepository } = createRepository()
      return new Repository(process.cwd(), 123, gitHubRepository, false)
    }

    function renderWithCommitModes(
      overrides: Partial<CommitMessageProps> = {}
    ) {
      process.env[PreviewFeaturesEnv] = '1'
      const requests = new Array<ReadonlyArray<WorkingDirectoryFileChange>>()
      const props = createProps({
        isGeneratingCommitMessage: false,
        onCreateCopilotAssistedCommits: files => requests.push(files),
        repository: createMountableRepository(),
        ...overrides,
      })
      const view = render(<CommitMessage {...props} />)
      return { view, props, requests }
    }

    function createCommit() {
      const author = new CommitIdentity(
        'Mona Lisa',
        'mona@example.com',
        new Date()
      )
      return new Commit(
        'abc1234',
        'abc1234',
        'Summary',
        '',
        author,
        author,
        [],
        [],
        []
      )
    }

    function getManualFields(container: HTMLElement) {
      const fields = container.querySelector('.manual-commit-fields')
      assert.ok(fields)
      return fields
    }

    function switchToCopilotMode() {
      fireEvent.click(
        screen.getByRole('button', { name: 'Choose how to commit' })
      )
      fireEvent.click(screen.getByText('Commit with Copilot'))
    }

    it('does not offer commit modes when Copilot-assisted commits are unavailable', () => {
      process.env[PreviewFeaturesEnv] = '1'
      render(
        <CommitMessage
          {...createProps({
            isGeneratingCommitMessage: false,
            repository: createMountableRepository(),
          })}
        />
      )

      assert.equal(
        screen.queryByRole('button', { name: 'Choose how to commit' }),
        null
      )
    })

    it('does not offer commit modes when the feature is disabled', () => {
      const { view } = renderWithCommitModes()
      view.unmount()
      delete process.env[PreviewFeaturesEnv]

      render(
        <CommitMessage
          {...createProps({
            isGeneratingCommitMessage: false,
            onCreateCopilotAssistedCommits: () => {},
            repository: createMountableRepository(),
          })}
        />
      )

      assert.equal(
        screen.queryByRole('button', { name: 'Choose how to commit' }),
        null
      )
    })

    it('does not offer commit modes when amending', () => {
      renderWithCommitModes({
        commitToAmend: createCommit(),
      })

      assert.equal(
        screen.queryByRole('button', { name: 'Choose how to commit' }),
        null
      )
    })

    it('defaults to the manual commit mode', () => {
      const { view } = renderWithCommitModes()

      assert.ok(screen.getByRole('button', { name: 'Choose how to commit' }))
      assert.equal(
        getManualFields(view.container).getAttribute('aria-hidden'),
        null
      )
      assert.equal(view.container.querySelector('.copilot-commit-panel'), null)
    })

    it('replaces the commit message fields with Copilot when switching to the Copilot mode', () => {
      const { view } = renderWithCommitModes()

      switchToCopilotMode()

      const root = view.container.querySelector('.commit-message-component')
      assert.ok(root?.classList.contains('copilot-commit-mode'))
      assert.equal(
        getManualFields(view.container).getAttribute('aria-hidden'),
        'true'
      )
      assert.ok(view.container.querySelector('.copilot-commit-panel'))
      assert.ok(screen.getByText('Let Copilot write your commits'))
      assert.equal(localStorage.getItem('commit-mode'), 'copilot')
    })

    it('lets Copilot commit the selected files', () => {
      const { requests, props } = renderWithCommitModes()

      switchToCopilotMode()
      fireEvent.click(
        screen.getByRole('button', {
          name: 'Commit 1 file to main with Copilot',
        })
      )

      assert.equal(requests.length, 1)
      assert.deepEqual(requests[0], props.filesSelected)
    })

    it('does not need a commit summary to commit with Copilot', () => {
      renderWithCommitModes()

      const button = screen.getByRole('button', {
        name: 'Commit 1 file to main',
      })
      assert.equal(button.getAttribute('aria-disabled'), 'true')

      switchToCopilotMode()

      const copilotButton = screen.getByRole('button', {
        name: 'Commit 1 file to main with Copilot',
      })
      assert.equal(copilotButton.getAttribute('aria-disabled'), null)
    })

    it('needs selected files to commit with Copilot', () => {
      localStorage.setItem('commit-mode', 'copilot')
      renderWithCommitModes({
        anyFilesSelected: false,
        filesSelected: [],
        filesToBeCommittedCount: 0,
      })

      const button = screen.getByRole('button', {
        name: 'Commit to main with Copilot',
      })
      assert.equal(button.getAttribute('aria-disabled'), 'true')
    })

    it('remembers the commit mode', () => {
      localStorage.setItem('commit-mode', 'copilot')
      const { view } = renderWithCommitModes()

      assert.equal(
        getManualFields(view.container).getAttribute('aria-hidden'),
        'true'
      )
      assert.ok(view.container.querySelector('.copilot-commit-panel'))
    })
  })
})
