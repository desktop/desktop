import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '../../helpers/ui/render'
import assert from 'node:assert'
import { afterEach, describe, it, type TestContext } from 'node:test'
import * as React from 'react'
import { ipcRenderer } from 'electron'
import { act } from 'react-dom/test-utils'

import { Account } from '../../../src/models/account'
import { CommitMode } from '../../../src/models/commit-mode'
import { ICopilotAssistedCommitRequest } from '../../../src/models/copilot-assisted-commit'
import { DefaultCommitMessage } from '../../../src/models/commit-message'
import { Commit, ICommitContext } from '../../../src/models/commit'
import { Author } from '../../../src/models/author'
import { CommitIdentity } from '../../../src/models/commit-identity'
import { DiffSelection, DiffSelectionType } from '../../../src/models/diff'
import { GitHubRepository } from '../../../src/models/github-repository'
import { Owner } from '../../../src/models/owner'
import { RepoRulesInfo } from '../../../src/models/repo-rules'
import { Repository } from '../../../src/models/repository'
import { Popup, PopupType } from '../../../src/models/popup'
import { RepositorySettingsTab } from '../../../src/ui/repository-settings/repository-settings'
import {
  AppFileStatusKind,
  WorkingDirectoryFileChange,
} from '../../../src/models/status'
import { CommitMessage } from '../../../src/ui/changes/commit-message'
import {
  CoAuthorAutocompletionProvider,
  KnownUserHit,
  UserHit,
} from '../../../src/ui/autocompletion'
import { CommitOptions } from '../../../src/lib/app-state'
import { ISerializableMenuItem } from '../../../src/lib/menu-item'
import {
  getCommitMode,
  storeCommitMode,
} from '../../../src/lib/stores/helpers/commit-mode-storage'
import {
  createTestGitHubUserStore,
  createTestRepositoryStateCache,
} from '../../helpers/app-store-test-harness'
const PreviewFeaturesEnv = 'GITHUB_DESKTOP_PREVIEW_FEATURES'
const previousPreviewFeatures = process.env[PreviewFeaturesEnv]
const AddCoAuthorsLabel = __DARWIN__ ? 'Add Co-Authors' : 'Add co-authors'
const SkipHooksLabel = __DARWIN__
  ? 'Bypass Commit Hooks'
  : 'Bypass Commit hooks'
const SignOffLabel = __DARWIN__
  ? 'Add Signed-off-by Trailer'
  : 'Add Signed-off-by trailer'
const AllowEmptyLabel = __DARWIN__ ? 'Allow Empty Commit' : 'Allow empty commit'

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
  localStorage.clear()

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
      overrides: Partial<CommitMessageProps> = {},
      cache = createTestRepositoryStateCache()
    ) {
      process.env[PreviewFeaturesEnv] = '1'
      const requests = new Array<ICopilotAssistedCommitRequest>()
      const props = createProps({
        isGeneratingCommitMessage: false,
        onCreateCopilotAssistedCommits: request => requests.push(request),
        repository: createMountableRepository(),
        ...overrides,
      })

      function Harness(componentProps: CommitMessageProps) {
        const [commitMode, setCommitMode] = React.useState(
          cache.get(componentProps.repository).changesState.commitMode
        )
        const onCommitModeChanged = (mode: CommitMode) => {
          storeCommitMode(componentProps.repository, mode)
          cache.updateChangesState(componentProps.repository, () => ({
            commitMode: mode,
          }))
          setCommitMode(mode)
          componentProps.onCommitModeChanged?.(mode)
        }
        return (
          <CommitMessage
            {...componentProps}
            commitMode={componentProps.commitMode ?? commitMode}
            onCommitModeChanged={onCommitModeChanged}
          />
        )
      }

      const view = render(<Harness {...props} />)
      return {
        view,
        props,
        requests,
        cache,
        rerender: (nextProps: Partial<CommitMessageProps>) =>
          view.rerender(<Harness {...props} {...nextProps} />),
      }
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

    function switchToManualMode() {
      fireEvent.click(
        screen.getByRole('button', { name: 'Choose how to commit' })
      )
      fireEvent.click(screen.getByText('Commit', { selector: '.option-title' }))
    }

    it('does not offer commit modes when Copilot-assisted commits are unavailable', () => {
      storeCommitMode(createMountableRepository(), 'copilot')
      const { requests, props } = renderWithCommitModes({
        onCreateCopilotAssistedCommits: undefined,
      })

      assert.equal(
        screen.queryByRole('button', { name: 'Choose how to commit' }),
        null
      )
      assert.ok(screen.getByRole('combobox', { name: 'Commit summary' }))
      assert.strictEqual(getCommitMode(props.repository), 'copilot')
      assert.strictEqual(requests.length, 0)
    })

    it('does not offer commit modes when the feature is disabled', () => {
      const { rerender } = renderWithCommitModes()
      switchToCopilotMode()
      delete process.env[PreviewFeaturesEnv]

      rerender({})

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
      const { view, props } = renderWithCommitModes()

      switchToCopilotMode()

      const root = view.container.querySelector('.commit-message-component')
      assert.ok(root?.classList.contains('copilot-commit-mode'))
      assert.equal(
        getManualFields(view.container).getAttribute('aria-hidden'),
        'true'
      )
      assert.ok(view.container.querySelector('.copilot-commit-panel'))
      assert.ok(screen.getByText('Let Copilot write your commits'))
      assert.strictEqual(getCommitMode(props.repository), 'copilot')
      assert.strictEqual(localStorage.getItem('commit-mode'), null)
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
      assert.deepStrictEqual(requests[0], {
        files: props.filesSelected,
        trailers: [],
        skipCommitHooks: false,
        signOffCommits: false,
        allowEmptyCommit: false,
      })
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
      storeCommitMode(createMountableRepository(), 'copilot')
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
      storeCommitMode(createMountableRepository(), 'copilot')
      const { view } = renderWithCommitModes()

      assert.equal(
        getManualFields(view.container).getAttribute('aria-hidden'),
        'true'
      )
      assert.ok(view.container.querySelector('.copilot-commit-panel'))
    })

    it('does not share the chosen commit mode with another repository', () => {
      const first = renderWithCommitModes()
      switchToCopilotMode()
      first.view.unmount()

      const second = renderWithCommitModes({
        repository: new Repository(
          `${process.cwd()}/app`,
          124,
          createRepository().gitHubRepository,
          false
        ),
      })

      assert.strictEqual(
        getManualFields(second.view.container).getAttribute('aria-hidden'),
        null
      )
      assert.strictEqual(
        second.view.container.querySelector('.copilot-commit-panel'),
        null
      )
    })

    it('does not inherit the unreleased global commit mode preference', () => {
      localStorage.setItem('commit-mode', 'copilot')
      const { view } = renderWithCommitModes()

      assert.strictEqual(
        getManualFields(view.container).getAttribute('aria-hidden'),
        null
      )
    })

    it('immediately removes manual fields from keyboard navigation in assisted mode', () => {
      const { view } = renderWithCommitModes()
      switchToCopilotMode()

      assert.ok(getManualFields(view.container).hasAttribute('inert'))
      assert.strictEqual(
        screen.queryByRole('combobox', { name: 'Commit summary' }),
        null
      )
      assert.strictEqual(
        screen.queryByRole('combobox', { name: 'Commit description' }),
        null
      )
    })

    it('does not commit through the keyboard shortcut while busy', () => {
      let commits = 0
      renderWithCommitModes({
        isCommitting: true,
        commitMessage: {
          summary: 'Draft',
          description: 'Keep this draft',
          timestamp: Date.now(),
        },
        onCreateCommit: async () => {
          commits++
          return false
        },
      })

      fireEvent.keyDown(window, {
        key: 'Enter',
        metaKey: __DARWIN__,
        ctrlKey: !__DARWIN__,
      })

      assert.strictEqual(commits, 0)
    })

    it('restores the chosen mode after switching repositories and reconstructing the state cache', () => {
      const first = renderWithCommitModes()
      switchToCopilotMode()
      const firstRepository = first.props.repository
      first.view.unmount()

      const second = renderWithCommitModes({
        repository: new Repository(`${process.cwd()}/app`, 124, null, false),
      })
      assert.ok(screen.getByRole('combobox', { name: 'Commit summary' }))
      second.view.unmount()

      const restored = renderWithCommitModes({
        repository: firstRepository,
      })
      assert.ok(screen.getByText('Let Copilot write your commits'))
      assert.strictEqual(
        screen.queryByRole('combobox', { name: 'Commit summary' }),
        null
      )
      assert.strictEqual(
        restored.cache.get(firstRepository).changesState.commitMode,
        'copilot'
      )
    })

    it('retains the typed manual draft and options when switching modes', () => {
      let persisted = DefaultCommitMessage
      const { view, requests } = renderWithCommitModes({
        allowEmptyCommit: true,
        signOffCommits: true,
        skipCommitHooks: true,
        onPersistCommitMessage: message => {
          persisted = message
        },
      })

      fireEvent.change(
        screen.getByRole('combobox', { name: 'Commit summary' }),
        { target: { value: 'My manual title' } }
      )
      fireEvent.change(
        screen.getByRole('combobox', { name: 'Commit description' }),
        { target: { value: 'My manual description' } }
      )

      switchToCopilotMode()
      fireEvent.click(
        screen.getByRole('button', {
          name: 'Commit 1 file to main with Copilot',
        })
      )
      switchToManualMode()

      const summary = screen.getByRole('combobox', { name: 'Commit summary' })
      assert.ok(summary instanceof HTMLInputElement)
      assert.strictEqual(summary.value, 'My manual title')
      const description = screen.getByRole('combobox', {
        name: 'Commit description',
      })
      assert.ok(description instanceof HTMLTextAreaElement)
      assert.strictEqual(description.value, 'My manual description')
      assert.ok(!getManualFields(view.container).hasAttribute('inert'))
      const exitingPanel = view.container.querySelector(
        '.copilot-commit-panel-container'
      )
      assert.strictEqual(exitingPanel?.getAttribute('aria-hidden'), 'true')
      assert.ok(exitingPanel?.hasAttribute('inert'))
      assert.strictEqual(
        screen
          .queryByText('Let Copilot write your commits')
          ?.closest('[aria-hidden="true"]'),
        exitingPanel
      )
      assert.strictEqual(requests[0].allowEmptyCommit, true)
      assert.strictEqual(requests[0].signOffCommits, true)
      assert.strictEqual(requests[0].skipCommitHooks, true)

      view.unmount()
      assert.strictEqual(persisted.summary, 'My manual title')
      assert.strictEqual(persisted.description, 'My manual description')
    })

    it('uses the repository-owned mode when it changes outside the component', () => {
      const { rerender } = renderWithCommitModes()

      rerender({ commitMode: 'copilot' })
      assert.ok(screen.getByText('Let Copilot write your commits'))
      fireEvent.click(
        screen.getByRole('button', { name: 'Choose how to commit' })
      )
      assert.strictEqual(
        screen
          .getByRole('menuitemradio', { name: /Commit with Copilot/ })
          .getAttribute('aria-checked'),
        'true'
      )

      fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
      rerender({ commitMode: 'manual' })
      assert.ok(screen.getByRole('combobox', { name: 'Commit summary' }))
    })

    it('moves focus out of manual fields when the effective mode changes', () => {
      const { rerender } = renderWithCommitModes()
      screen.getByRole('combobox', { name: 'Commit description' }).focus()

      rerender({ commitMode: 'copilot' })

      assert.strictEqual(
        document.activeElement,
        screen.getByRole('button', {
          name: 'Commit 1 file to main with Copilot',
        })
      )
    })

    it('focuses the assisted action instead of a hidden summary for focus requests', () => {
      let focusHandled = 0
      const { rerender } = renderWithCommitModes({
        onCommitMessageFocusSet: () => focusHandled++,
      })
      switchToCopilotMode()
      rerender({ focusCommitMessage: true })

      assert.strictEqual(
        document.activeElement,
        screen.getByRole('button', {
          name: 'Commit 1 file to main with Copilot',
        })
      )
      assert.strictEqual(focusHandled, 1)
    })

    it('supports choosing a mode by keyboard even when the primary action is disabled', () => {
      renderWithCommitModes()
      const dropdown = screen.getByRole('button', {
        name: 'Choose how to commit',
      })
      dropdown.focus()
      fireEvent.keyDown(dropdown, { key: 'ArrowUp' })
      fireEvent.keyDown(screen.getByRole('menu'), { key: 'Enter' })

      assert.ok(screen.getByText('Let Copilot write your commits'))
      assert.strictEqual(document.activeElement, dropdown)
      assert.strictEqual(dropdown.getAttribute('aria-expanded'), 'false')
    })

    it('invokes the assisted callback, not manual commits, for the commit shortcut', () => {
      let commits = 0
      const { requests } = renderWithCommitModes({
        onCreateCommit: async () => {
          commits++
          return false
        },
      })
      switchToCopilotMode()
      fireEvent.keyDown(window, {
        key: 'Enter',
        metaKey: __DARWIN__,
        ctrlKey: !__DARWIN__,
      })
      assert.strictEqual(requests.length, 1)
      assert.strictEqual(commits, 0)
    })

    it('keeps the commit shortcut working when the mode dropdown retains focus', () => {
      const { requests } = renderWithCommitModes()
      switchToCopilotMode()
      const dropdown = screen.getByRole('button', {
        name: 'Choose how to commit',
      })
      assert.strictEqual(document.activeElement, dropdown)
      fireEvent.keyDown(dropdown, {
        key: 'Enter',
        metaKey: __DARWIN__,
        ctrlKey: !__DARWIN__,
      })
      assert.strictEqual(requests.length, 1)
      assert.strictEqual(screen.queryByRole('menu'), null)
    })

    it('unmounts the author popover when manual fields become inactive', t => {
      const rectangle = new window.DOMRect(0, 0, 100, 100)
      t.mock.method(HTMLElement.prototype, 'getClientRects', () => ({
        0: rectangle,
        length: 1,
        item: (index: number) => (index === 0 ? rectangle : null),
        [Symbol.iterator]: function* () {
          yield rectangle
        },
      }))
      const { view, rerender } = renderWithCommitModes()
      fireEvent.click(
        screen.getByRole('button', {
          name: 'View commit author information',
        })
      )
      assert.ok(view.container.querySelector('.popover-component'))

      rerender({ commitMode: 'copilot' })
      assert.strictEqual(
        view.container.querySelector('.popover-component'),
        null
      )
      rerender({ commitMode: 'manual' })
      assert.strictEqual(
        view.container.querySelector('.popover-component'),
        null
      )
    })

    it('keeps co-author keyboard focus tracking active after an author popover is closed by a mode change', t => {
      const frames = new Map<number, FrameRequestCallback>()
      let frameID = 0
      t.mock.method(
        globalThis,
        'requestAnimationFrame',
        (callback: FrameRequestCallback) => {
          frames.set(++frameID, callback)
          return frameID
        }
      )
      t.mock.method(globalThis, 'cancelAnimationFrame', (id: number) => {
        frames.delete(id)
      })
      const rectangle = new window.DOMRect(0, 0, 100, 100)
      t.mock.method(HTMLElement.prototype, 'getClientRects', () => ({
        0: rectangle,
        length: 1,
        item: (index: number) => (index === 0 ? rectangle : null),
        [Symbol.iterator]: function* () {
          yield rectangle
        },
      }))
      const repository = createMountableRepository()
      assert.ok(repository.gitHubRepository)
      const provider = new CoAuthorAutocompletionProvider(
        createTestGitHubUserStore(),
        repository.gitHubRepository
      )
      t.mock.method(provider, 'getAutocompletionItems', async () => [])
      const { view, rerender } = renderWithCommitModes({
        repository,
        autocompletionProviders: [provider],
        showCoAuthoredBy: true,
        coAuthors: [
          {
            kind: 'known',
            name: 'First Author',
            email: 'first@example.com',
            username: 'first',
          },
          {
            kind: 'known',
            name: 'Second Author',
            email: 'second@example.com',
            username: 'second',
          },
        ],
      })
      fireEvent.click(
        screen.getByRole('button', { name: 'View commit author information' })
      )
      assert.ok(view.container.querySelector('.popover-component'))
      rerender({ commitMode: 'copilot' })

      const input = screen.getByRole('combobox', { name: /Co-Authors/ })
      input.focus()
      const container = input.closest('.focus-container')
      assert.ok(container?.classList.contains('focus-within'))
      const pendingFrames = [...frames.values()]
      frames.clear()
      for (const callback of pendingFrames) {
        callback(performance.now())
      }
      fireEvent.keyDown(input, { key: 'ArrowLeft' })
      assert.strictEqual(
        document.activeElement,
        screen.getByRole('option', { name: /Second Author/ })
      )
    })

    it('keeps an assisted preference but falls back to manual when amending', () => {
      const { props, rerender, requests } = renderWithCommitModes()
      switchToCopilotMode()
      rerender({ commitToAmend: createCommit() })

      assert.ok(screen.getByRole('combobox', { name: 'Commit summary' }))
      assert.strictEqual(
        screen.queryByRole('button', { name: 'Choose how to commit' }),
        null
      )
      assert.strictEqual(getCommitMode(props.repository), 'copilot')
      assert.strictEqual(requests.length, 0)

      rerender({ commitToAmend: null })
      assert.ok(screen.getByText('Let Copilot write your commits'))
    })

    it('keeps tutorials manual even if an assisted callback is provided', () => {
      const repository = new Repository(
        process.cwd(),
        123,
        null,
        false,
        null,
        {},
        true
      )
      storeCommitMode(repository, 'copilot')
      renderWithCommitModes({ repository })

      assert.ok(screen.getByRole('combobox', { name: 'Commit summary' }))
      assert.strictEqual(
        screen.queryByRole('button', { name: 'Choose how to commit' }),
        null
      )
    })

    it('does not offer assisted commits without Copilot access or authentication', () => {
      const account = createAccount()
      const unavailableAccounts = [
        [],
        [Account.anonymous()],
        [account.withToken('')],
        [
          new Account(
            account.login,
            account.endpoint,
            account.token,
            [],
            '',
            account.id,
            account.name,
            'free',
            account.copilotEndpoint,
            false,
            account.features
          ),
        ],
        [
          new Account(
            account.login,
            account.endpoint,
            account.token,
            [],
            '',
            account.id,
            account.name,
            'free',
            account.copilotEndpoint,
            true,
            []
          ),
        ],
      ]
      for (const accounts of unavailableAccounts) {
        const { view } = renderWithCommitModes({
          commitMode: 'copilot',
          accounts,
        })
        assert.ok(screen.getByRole('combobox', { name: 'Commit summary' }))
        assert.strictEqual(
          screen.queryByRole('button', { name: 'Choose how to commit' }),
          null
        )
        view.unmount()
      }
    })

    it('does not mistake manual message generation for assisted progress', () => {
      const { rerender } = renderWithCommitModes({ commitMode: 'copilot' })

      rerender({ isGeneratingCommitMessage: true })
      assert.strictEqual(screen.queryByText('Copilot is on it…'), null)
      assert.ok(screen.getByText('Let Copilot write your commits'))

      rerender({ isCreatingCopilotAssistedCommits: true })
      assert.ok(screen.getByText('Copilot is on it…'))
    })

    for (const busyState of [
      { isCommitting: true },
      { isGeneratingCommitMessage: true },
      { isCreatingCopilotAssistedCommits: true },
    ]) {
      it(`locks mode, options and execution while ${
        Object.keys(busyState)[0]
      }`, () => {
        const { rerender, requests } = renderWithCommitModes({
          commitMode: 'copilot',
        })
        const dropdown = screen.getByRole('button', {
          name: 'Choose how to commit',
        })
        fireEvent.click(dropdown)
        assert.ok(screen.getByRole('menu'))

        rerender(busyState)
        assert.strictEqual(screen.queryByRole('menu'), null)
        assert.strictEqual(dropdown.getAttribute('aria-disabled'), 'true')
        fireEvent.keyDown(dropdown, { key: 'ArrowDown' })
        fireEvent.click(dropdown)
        assert.strictEqual(screen.queryByRole('menu'), null)

        const optionsButton = screen.getByRole('button', {
          name: 'Configure commit options',
        })
        assert.strictEqual(optionsButton.getAttribute('aria-disabled'), 'true')
        fireEvent.click(
          screen.getByRole('button', {
            name: /(?:Commit|Committing) 1 file to main with Copilot/,
          })
        )
        fireEvent.keyDown(window, {
          key: 'Enter',
          metaKey: __DARWIN__,
          ctrlKey: !__DARWIN__,
        })
        assert.strictEqual(requests.length, 0)
      })
    }

    it('dispatches one empty-commit request without selected files', () => {
      const { requests } = renderWithCommitModes({
        commitMode: 'copilot',
        anyFilesSelected: false,
        filesSelected: [],
        filesToBeCommittedCount: 0,
        allowEmptyCommit: true,
      })
      assert.ok(screen.getByText('Create an empty commit'))
      fireEvent.click(
        screen.getByRole('button', {
          name: 'Commit to main with Copilot',
        })
      )
      assert.strictEqual(requests.length, 1)
      assert.deepStrictEqual(requests[0].files, [])
      assert.strictEqual(requests[0].allowEmptyCommit, true)
    })

    it('keeps ordinary manual commit-message generation available without assisted execution', () => {
      const generated = new Array<{
        readonly files: ReadonlyArray<WorkingDirectoryFileChange>
        readonly override: boolean
      }>()
      const { props } = renderWithCommitModes({
        onCreateCopilotAssistedCommits: undefined,
        onGenerateCommitMessage: (files, override) =>
          generated.push({ files, override }),
      })
      fireEvent.change(
        screen.getByRole('combobox', { name: 'Commit summary' }),
        { target: { value: 'Manual title' } }
      )
      fireEvent.click(
        screen.getByRole('button', {
          name: 'Generate commit message with Copilot',
        })
      )
      assert.deepStrictEqual(generated, [
        {
          files: props.filesSelected,
          override: true,
        },
      ])
      assert.strictEqual(
        screen.queryByRole('button', { name: 'Choose how to commit' }),
        null
      )
    })

    it('accepts newer generated messages without overwriting a newer manually edited draft', () => {
      const { rerender } = renderWithCommitModes({
        onCreateCopilotAssistedCommits: undefined,
        commitMessage: {
          summary: 'Initial title',
          description: 'Initial body',
          timestamp: 1,
        },
      })
      rerender({
        commitMessage: {
          summary: 'Generated title',
          description: 'Generated body',
          timestamp: 2,
          generatedByCopilot: true,
        },
      })
      const summary = screen.getByRole('combobox', { name: 'Commit summary' })
      const description = screen.getByRole('combobox', {
        name: 'Commit description',
      })
      assert.ok(summary instanceof HTMLInputElement)
      assert.ok(description instanceof HTMLTextAreaElement)
      assert.strictEqual(summary.value, 'Generated title')
      assert.strictEqual(description.value, 'Generated body')

      fireEvent.change(summary, { target: { value: 'Edited title' } })
      rerender({
        commitMessage: {
          summary: 'Stale title',
          description: 'Stale body',
          timestamp: 3,
        },
      })
      assert.strictEqual(summary.value, 'Edited title')
      assert.strictEqual(description.value, 'Generated body')
    })

    function renderWithPendingCoAuthors(
      t: TestContext,
      deferAuthorProps = false
    ) {
      const repository = createMountableRepository()
      assert.ok(repository.gitHubRepository)
      const provider = new CoAuthorAutocompletionProvider(
        createTestGitHubUserStore(),
        repository.gitHubRepository
      )
      t.mock.method(provider, 'getAutocompletionItems', async () => [])
      const lookups = new Array<{
        readonly username: string
        readonly resolve: (hit: UserHit | null) => void
      }>()
      t.mock.method(
        provider,
        'exactMatch',
        (username: string) =>
          new Promise<UserHit | null>(resolve =>
            lookups.push({ username, resolve })
          )
      )
      const commits = new Array<ICommitContext>()
      const emissions = new Array<ReadonlyArray<Author>>()
      let queuedAuthors: ReadonlyArray<Author> | null = null
      let flushQueuedAuthors: () => void = () => {
        throw new Error('Author form has not mounted')
      }
      const props = createProps({
        repository,
        isGeneratingCommitMessage: false,
        autocompletionProviders: [provider],
        showCoAuthoredBy: true,
        commitMessage: {
          summary: 'Manual title',
          description: '',
          timestamp: 1,
        },
        onCreateCommit: async context => {
          commits.push(context)
          return false
        },
      })

      function Form({ busy }: { readonly busy: boolean }) {
        const [authors, setAuthors] = React.useState<ReadonlyArray<Author>>([])
        flushQueuedAuthors = () => {
          if (queuedAuthors !== null) {
            setAuthors(queuedAuthors)
            queuedAuthors = null
          }
        }
        const onAuthorsUpdated = (nextAuthors: ReadonlyArray<Author>) => {
          emissions.push(nextAuthors)
          if (deferAuthorProps) {
            queuedAuthors = nextAuthors
          } else {
            setAuthors(nextAuthors)
          }
        }
        return (
          <CommitMessage
            {...props}
            coAuthors={authors}
            onCoAuthorsUpdated={onAuthorsUpdated}
            isGeneratingCommitMessage={busy}
          />
        )
      }
      const view = render(<Form busy={false} />)
      return {
        view,
        lookups,
        commits,
        emissions,
        flushAuthorProps: () => act(flushQueuedAuthors),
        setBusy: (busy: boolean) => view.rerender(<Form busy={busy} />),
      }
    }

    function addUncachedCoAuthor(username: string) {
      const input = screen.getByRole('combobox', { name: /Co-Authors/ })
      assert.ok(input instanceof HTMLInputElement)
      fireEvent.change(input, { target: { value: username } })
      input.setSelectionRange(username.length, username.length)
      fireEvent.keyDown(input, { key: ' ' })
    }

    function createResolvedCoAuthor(
      username: string,
      name: string
    ): KnownUserHit {
      return {
        kind: 'known-user',
        username,
        name,
        email: `${username}@example.com`,
        endpoint: 'https://api.github.com',
      }
    }

    it('retains successful co-author lookups completed during manual message generation', async t => {
      const { lookups, commits, setBusy } = renderWithPendingCoAuthors(t)
      addUncachedCoAuthor('uncached')
      assert.strictEqual(lookups.length, 1)
      setBusy(true)
      lookups[0].resolve(
        createResolvedCoAuthor('uncached', 'Resolved Coauthor')
      )
      await new Promise<void>(resolve => setImmediate(resolve))
      assert.ok(screen.getByRole('option', { name: /uncached, searching/ }))

      setBusy(false)
      await waitFor(() =>
        assert.ok(screen.getByRole('option', { name: /Resolved Coauthor/ }))
      )
      fireEvent.click(
        screen.getByRole('button', { name: 'Commit 1 file to main' })
      )
      assert.deepStrictEqual(commits[0].trailers, [
        {
          token: 'Co-Authored-By',
          value: 'Resolved Coauthor <uncached@example.com>',
        },
      ])
    })

    it('retains every concurrent co-author resolution while busy', async t => {
      const { lookups, commits, setBusy } = renderWithPendingCoAuthors(t)
      addUncachedCoAuthor('first')
      addUncachedCoAuthor('second')
      assert.strictEqual(lookups.length, 2)
      setBusy(true)
      lookups[0].resolve(createResolvedCoAuthor('first', 'First Author'))
      lookups[1].resolve(createResolvedCoAuthor('second', 'Second Author'))
      await new Promise<void>(resolve => setImmediate(resolve))
      assert.ok(screen.getByRole('option', { name: /first, searching/ }))
      assert.ok(screen.getByRole('option', { name: /second, searching/ }))

      setBusy(false)
      await waitFor(() => {
        assert.ok(screen.getByRole('option', { name: /First Author/ }))
        assert.ok(screen.getByRole('option', { name: /Second Author/ }))
      })
      fireEvent.click(
        screen.getByRole('button', { name: 'Commit 1 file to main' })
      )
      assert.deepStrictEqual(commits[0].trailers, [
        { token: 'Co-Authored-By', value: 'First Author <first@example.com>' },
        {
          token: 'Co-Authored-By',
          value: 'Second Author <second@example.com>',
        },
      ])
      assert.strictEqual(lookups.length, 2)
    })

    it('retains earlier co-author results until the store acknowledges a frame-batched update', async t => {
      const { lookups, commits, setBusy, flushAuthorProps, emissions } =
        renderWithPendingCoAuthors(t, true)
      addUncachedCoAuthor('first')
      flushAuthorProps()
      addUncachedCoAuthor('second')
      flushAuthorProps()
      setBusy(true)

      lookups[0].resolve(createResolvedCoAuthor('first', 'First Author'))
      await new Promise<void>(resolve => setImmediate(resolve))
      setBusy(false)
      const beforeSecondResult = emissions.length
      setBusy(false)
      assert.strictEqual(emissions.length, beforeSecondResult)

      lookups[1].resolve(createResolvedCoAuthor('second', 'Second Author'))
      await new Promise<void>(resolve => setImmediate(resolve))
      flushAuthorProps()
      assert.ok(screen.getByRole('option', { name: /First Author/ }))
      assert.ok(screen.getByRole('option', { name: /Second Author/ }))
      fireEvent.click(
        screen.getByRole('button', { name: 'Commit 1 file to main' })
      )
      assert.deepStrictEqual(commits[0].trailers, [
        { token: 'Co-Authored-By', value: 'First Author <first@example.com>' },
        {
          token: 'Co-Authored-By',
          value: 'Second Author <second@example.com>',
        },
      ])
      assert.strictEqual(lookups.length, 2)
    })

    it('preserves a co-author removal while resolved author props are awaiting acknowledgment', async t => {
      const { lookups, commits, setBusy, flushAuthorProps } =
        renderWithPendingCoAuthors(t, true)
      addUncachedCoAuthor('first')
      flushAuthorProps()
      addUncachedCoAuthor('second')
      flushAuthorProps()
      setBusy(true)
      lookups[0].resolve(createResolvedCoAuthor('first', 'First Author'))
      await new Promise<void>(resolve => setImmediate(resolve))
      setBusy(false)

      fireEvent.click(
        within(
          screen.getByRole('option', {
            name: /first, searching/,
          })
        ).getByRole('button')
      )
      lookups[1].resolve(createResolvedCoAuthor('second', 'Second Author'))
      await new Promise<void>(resolve => setImmediate(resolve))
      flushAuthorProps()
      assert.strictEqual(
        screen.queryByRole('option', { name: /First Author|first, searching/ }),
        null
      )
      assert.ok(screen.getByRole('option', { name: /Second Author/ }))
      fireEvent.click(
        screen.getByRole('button', { name: 'Commit 1 file to main' })
      )
      assert.deepStrictEqual(commits[0].trailers, [
        {
          token: 'Co-Authored-By',
          value: 'Second Author <second@example.com>',
        },
      ])
      assert.strictEqual(lookups.length, 2)
    })

    it('preserves a newly added co-author while earlier lookup results await a frame acknowledgment', async t => {
      const { lookups, commits, setBusy, flushAuthorProps } =
        renderWithPendingCoAuthors(t, true)
      addUncachedCoAuthor('first')
      flushAuthorProps()
      addUncachedCoAuthor('second')
      flushAuthorProps()
      setBusy(true)
      lookups[0].resolve(createResolvedCoAuthor('first', 'First Author'))
      await new Promise<void>(resolve => setImmediate(resolve))
      setBusy(false)

      addUncachedCoAuthor('third')
      lookups[1].resolve(createResolvedCoAuthor('second', 'Second Author'))
      await new Promise<void>(resolve => setImmediate(resolve))
      flushAuthorProps()
      assert.ok(screen.getByRole('option', { name: /First Author/ }))
      assert.ok(screen.getByRole('option', { name: /Second Author/ }))
      assert.ok(screen.getByRole('option', { name: /third, searching/ }))
      lookups[2].resolve(createResolvedCoAuthor('third', 'Third Author'))
      await new Promise<void>(resolve => setImmediate(resolve))
      flushAuthorProps()
      fireEvent.click(
        screen.getByRole('button', { name: 'Commit 1 file to main' })
      )
      assert.deepStrictEqual(commits[0].trailers, [
        { token: 'Co-Authored-By', value: 'First Author <first@example.com>' },
        {
          token: 'Co-Authored-By',
          value: 'Second Author <second@example.com>',
        },
        { token: 'Co-Authored-By', value: 'Third Author <third@example.com>' },
      ])
      assert.strictEqual(lookups.length, 3)
    })

    it('retains failed co-author lookup results until busy ends without retry loops', async t => {
      const { lookups, setBusy } = renderWithPendingCoAuthors(t)
      addUncachedCoAuthor('missing')
      setBusy(true)
      lookups[0].resolve(null)
      await new Promise<void>(resolve => setImmediate(resolve))
      assert.ok(screen.getByRole('option', { name: /missing, searching/ }))

      setBusy(false)
      await waitFor(() =>
        assert.ok(
          screen.getByRole('option', { name: /missing, user not found/ })
        )
      )
      assert.strictEqual(lookups.length, 1)
    })

    it('ignores author lookup results after the repository form unmounts', async t => {
      const errors = t.mock.method(console, 'error', () => {})
      const { view, lookups } = renderWithPendingCoAuthors(t)
      addUncachedCoAuthor('uncached')
      view.unmount()
      lookups[0].resolve(createResolvedCoAuthor('uncached', 'Late Author'))
      await new Promise<void>(resolve => setImmediate(resolve))
      assert.ok(
        !errors.mock.calls.some(call =>
          call.arguments.some(
            argument =>
              typeof argument === 'string' &&
              argument.includes('unmounted component')
          )
        )
      )
    })

    it('does not resolve a newly added co-author using an earlier removed author lookup', async t => {
      const { lookups } = renderWithPendingCoAuthors(t)
      addUncachedCoAuthor('uncached')
      fireEvent.click(
        within(
          screen.getByRole('option', { name: /uncached, searching/ })
        ).getByRole('button')
      )
      addUncachedCoAuthor('uncached')
      assert.strictEqual(lookups.length, 2)

      lookups[0].resolve(createResolvedCoAuthor('uncached', 'Stale Resolution'))
      await new Promise<void>(resolve => setImmediate(resolve))
      assert.strictEqual(
        screen.queryByRole('option', { name: /Stale Resolution/ }),
        null
      )
      assert.ok(screen.getByRole('option', { name: /uncached, searching/ }))

      lookups[1].resolve(
        createResolvedCoAuthor('uncached', 'Current Resolution')
      )
      await waitFor(() =>
        assert.ok(screen.getByRole('option', { name: /Current Resolution/ }))
      )
    })

    it('does not apply a co-author lookup from an earlier repository context', async t => {
      const repository = createMountableRepository()
      assert.ok(repository.gitHubRepository)
      const provider = new CoAuthorAutocompletionProvider(
        createTestGitHubUserStore(),
        repository.gitHubRepository
      )
      t.mock.method(provider, 'getAutocompletionItems', async () => [])
      const lookups = new Array<(hit: UserHit | null) => void>()
      t.mock.method(
        provider,
        'exactMatch',
        () => new Promise<UserHit | null>(resolve => lookups.push(resolve))
      )
      const props = createProps({
        repository,
        isGeneratingCommitMessage: false,
        autocompletionProviders: [provider],
        showCoAuthoredBy: true,
      })

      function Form({ repo }: { readonly repo: Repository }) {
        const [authors, setAuthors] = React.useState<ReadonlyArray<Author>>([])
        return (
          <CommitMessage
            {...props}
            repository={repo}
            coAuthors={authors}
            onCoAuthorsUpdated={setAuthors}
          />
        )
      }
      const view = render(<Form repo={repository} />)
      addUncachedCoAuthor('uncached')
      const second = new Repository(
        repository.path,
        124,
        repository.gitHubRepository,
        false
      )
      view.rerender(<Form repo={second} />)
      assert.strictEqual(lookups.length, 2)

      lookups[0](createResolvedCoAuthor('uncached', 'Previous Repository'))
      await new Promise<void>(resolve => setImmediate(resolve))
      assert.strictEqual(
        screen.queryByRole('option', {
          name: /Previous Repository/,
        }),
        null
      )
      lookups[1](createResolvedCoAuthor('uncached', 'Current Repository'))
      await waitFor(() =>
        assert.ok(
          screen.getByRole('option', {
            name: /Current Repository/,
          })
        )
      )
    })

    it('explains an enforced author email blocker and exposes settings in assisted mode', async () => {
      const rules = new RepoRulesInfo()
      rules.commitAuthorEmailPatterns.push({
        enforced: true,
        matcher: email => email.endsWith('@company.example'),
        humanDescription: 'must end with "@company.example"',
        rulesetId: 1,
      })
      const popups = new Array<Popup>()
      const { props, requests, rerender } = renderWithCommitModes({
        repoRulesInfo: rules,
        repositoryAccount: createAccount(),
        commitAuthor: new CommitIdentity(
          'Mona Lisa',
          'personal@example.com',
          new Date()
        ),
        onShowPopup: popup => popups.push(popup),
      })
      await waitFor(() =>
        assert.ok(
          screen.getByRole('button', {
            name: 'Email address is disallowed. View warning.',
          })
        )
      )
      switchToCopilotMode()
      assert.ok(
        screen.getByText(
          "Your commit author email does not meet this repository's rules."
        )
      )
      const settings = screen.getByRole('button', {
        name: 'Update author email',
      })
      assert.strictEqual(settings.closest('[inert]'), null)
      const commit = screen.getByRole('button', {
        name: 'Commit 1 file to main with Copilot',
      })
      assert.strictEqual(commit.getAttribute('aria-disabled'), 'true')
      assert.strictEqual(
        commit.getAttribute('aria-describedby'),
        screen.getByRole('alert').id
      )
      fireEvent.click(commit)
      assert.strictEqual(requests.length, 0)
      fireEvent.click(settings)
      assert.deepStrictEqual(popups, [
        {
          type: PopupType.RepositorySettings,
          repository: props.repository,
          initialSelectedTab: RepositorySettingsTab.GitConfig,
        },
      ])

      rerender({ isCreatingCopilotAssistedCommits: true })
      assert.strictEqual(settings.getAttribute('aria-disabled'), 'true')
      fireEvent.click(settings)
      assert.strictEqual(popups.length, 1)

      rerender({
        commitAuthor: new CommitIdentity(
          'Mona Lisa',
          'mona@company.example',
          new Date()
        ),
        isCreatingCopilotAssistedCommits: false,
      })
      await waitFor(() =>
        assert.strictEqual(commit.getAttribute('aria-disabled'), null)
      )
      assert.strictEqual(
        screen.queryByRole('button', { name: 'Update author email' }),
        null
      )
      fireEvent.click(commit)
      assert.strictEqual(requests.length, 1)
    })

    it('keeps bypassable author rules visible without blocking assisted execution', async () => {
      const rules = new RepoRulesInfo()
      rules.commitAuthorEmailPatterns.push({
        enforced: 'bypass',
        matcher: email => email.endsWith('@company.example'),
        humanDescription: 'must end with "@company.example"',
        rulesetId: 1,
      })
      const { requests } = renderWithCommitModes({
        commitMode: 'copilot',
        repoRulesInfo: rules,
        repositoryAccount: createAccount(),
        commitAuthor: new CommitIdentity(
          'Mona Lisa',
          'personal@example.com',
          new Date()
        ),
      })
      await waitFor(() =>
        assert.ok(screen.getByText(/You can bypass these rules/))
      )
      const commit = screen.getByRole('button', {
        name: 'Commit 1 file to main with Copilot',
      })
      assert.strictEqual(commit.getAttribute('aria-disabled'), null)
      fireEvent.click(commit)
      assert.strictEqual(requests.length, 1)
    })

    it('does not insert an open co-author completion while assisted execution is busy', async t => {
      const repository = createMountableRepository()
      assert.ok(repository.gitHubRepository)
      const provider = new CoAuthorAutocompletionProvider(
        createTestGitHubUserStore(),
        repository.gitHubRepository
      )
      t.mock.method(provider, 'getAutocompletionItems', async (text: string) =>
        text.startsWith('mo')
          ? [createResolvedCoAuthor('mona', 'Mona Lisa')]
          : []
      )
      const authors = new Array<ReadonlyArray<Author>>()
      let requests = 0
      const { rerender } = renderWithCommitModes({
        repository,
        commitMode: 'copilot',
        autocompletionProviders: [provider],
        showCoAuthoredBy: true,
        onCoAuthorsUpdated: updated => authors.push(updated),
        onCreateCopilotAssistedCommits: () => {
          requests++
          rerender({ isCreatingCopilotAssistedCommits: true })
        },
      })
      const input = screen.getByRole('combobox', { name: /Co-Authors/ })
      assert.ok(input instanceof HTMLInputElement)
      fireEvent.change(input, { target: { value: 'mo' } })
      await waitFor(() =>
        assert.strictEqual(input.getAttribute('aria-expanded'), 'true')
      )
      fireEvent.keyDown(input, {
        key: 'Enter',
        metaKey: __DARWIN__,
        ctrlKey: !__DARWIN__,
      })
      assert.strictEqual(requests, 1)
      assert.strictEqual(input.readOnly, true)
      fireEvent.keyDown(input, { key: 'ArrowDown' })
      fireEvent.keyDown(input, { key: 'Tab' })
      assert.strictEqual(input.value, 'mo')
      assert.deepStrictEqual(authors, [])
      assert.strictEqual(input.getAttribute('aria-expanded'), 'false')

      rerender({ isCreatingCopilotAssistedCommits: false })
      fireEvent.change(input, { target: { value: 'mon' } })
      await waitFor(() =>
        assert.strictEqual(input.getAttribute('aria-expanded'), 'true')
      )
      fireEvent.keyDown(input, { key: 'ArrowDown' })
      fireEvent.keyDown(input, { key: 'Tab' })
      assert.deepStrictEqual(authors, [
        [
          {
            kind: 'known',
            username: 'mona',
            name: 'Mona Lisa',
            email: 'mona@example.com',
          },
        ],
      ])
      assert.strictEqual(input.value, '')
    })

    it('invalidates pending co-author suggestions when read-only begins', async t => {
      const repository = createMountableRepository()
      assert.ok(repository.gitHubRepository)
      const provider = new CoAuthorAutocompletionProvider(
        createTestGitHubUserStore(),
        repository.gitHubRepository
      )
      let complete: ((items: ReadonlyArray<UserHit>) => void) | null = null
      t.mock.method(provider, 'getAutocompletionItems', (text: string) =>
        text === 'mo'
          ? new Promise<ReadonlyArray<UserHit>>(resolve => {
              complete = resolve
            })
          : Promise.resolve([])
      )
      const { rerender } = renderWithCommitModes({
        repository,
        commitMode: 'copilot',
        autocompletionProviders: [provider],
        showCoAuthoredBy: true,
      })
      const input = screen.getByRole('combobox', { name: /Co-Authors/ })
      assert.ok(input instanceof HTMLInputElement)
      fireEvent.change(input, { target: { value: 'mo' } })
      assert.ok(complete)
      const completeRequest: (items: ReadonlyArray<UserHit>) => void = complete
      rerender({ isCreatingCopilotAssistedCommits: true })
      completeRequest([createResolvedCoAuthor('mona', 'Mona Lisa')])
      await new Promise<void>(resolve => setImmediate(resolve))
      assert.strictEqual(input.getAttribute('aria-expanded'), 'false')
      assert.strictEqual(input.value, 'mo')
      rerender({ isCreatingCopilotAssistedCommits: false })
      assert.strictEqual(input.getAttribute('aria-expanded'), 'false')
      assert.strictEqual(input.value, 'mo')
    })

    function captureOptionsMenu(t: TestContext) {
      const menus = new Array<ReadonlyArray<ISerializableMenuItem>>()
      let selectedLabel: string | null = null
      t.mock.method(
        ipcRenderer,
        'invoke',
        async (
          channel: string,
          items: ReadonlyArray<ISerializableMenuItem>
        ) => {
          assert.strictEqual(channel, 'show-contextual-menu')
          menus.push(items)
          const index = items.findIndex(item => item.label === selectedLabel)
          return index < 0 ? null : [index]
        }
      )
      return {
        menus,
        select: (label: string) => {
          selectedLabel = label
          fireEvent.click(
            screen.getByRole('button', {
              name: 'Configure commit options',
            })
          )
        },
      }
    }

    it('exposes co-authors and every existing option through the compact assisted options control', async t => {
      const { menus, select } = captureOptionsMenu(t)
      const updates = new Array<Partial<CommitOptions>>()
      const coAuthorToggles = new Array<boolean>()
      const { props } = renderWithCommitModes({
        commitMode: 'copilot',
        onUpdateCommitOptions: (repository, options) => {
          assert.strictEqual(repository, props.repository)
          updates.push(options)
        },
        onShowCoAuthoredByChanged: show => coAuthorToggles.push(show),
      })
      select(AddCoAuthorsLabel)
      await waitFor(() => assert.deepStrictEqual(coAuthorToggles, [true]))
      assert.deepStrictEqual(
        menus[0]
          .filter(item => item.type !== 'separator')
          .map(item => item.label),
        [AddCoAuthorsLabel, SkipHooksLabel, SignOffLabel, AllowEmptyLabel]
      )

      for (const label of [SkipHooksLabel, SignOffLabel, AllowEmptyLabel]) {
        select(label)
      }
      await waitFor(() =>
        assert.deepStrictEqual(updates, [
          { skipCommitHooks: true },
          { signOffCommits: true },
          { allowEmptyCommit: true },
        ])
      )
      assert.strictEqual(
        screen.queryByRole('button', {
          name: 'Generate commit message with Copilot',
        }),
        null
      )
    })

    it('keeps co-author editing reachable and includes trailers and options in assisted requests', () => {
      const repository = createMountableRepository()
      assert.ok(repository.gitHubRepository)
      const provider = new CoAuthorAutocompletionProvider(
        createTestGitHubUserStore(),
        repository.gitHubRepository
      )
      const { rerender, requests } = renderWithCommitModes({
        repository,
        autocompletionProviders: [provider],
        showCoAuthoredBy: true,
        coAuthors: [
          {
            kind: 'known',
            name: 'Mona Lisa',
            email: 'mona@example.com',
            username: 'mona',
          },
        ],
        skipCommitHooks: true,
        signOffCommits: true,
      })
      const coAuthorsInput = screen.getByRole('combobox', {
        name: /Co-Authors/,
      })
      switchToCopilotMode()
      assert.strictEqual(
        screen.getByRole('combobox', { name: /Co-Authors/ }),
        coAuthorsInput
      )
      fireEvent.click(
        screen.getByRole('button', {
          name: 'Commit 1 file to main with Copilot',
        })
      )
      assert.deepStrictEqual(requests[0].trailers, [
        {
          token: 'Co-Authored-By',
          value: 'Mona Lisa <mona@example.com>',
        },
      ])
      assert.strictEqual(requests[0].skipCommitHooks, true)
      assert.strictEqual(requests[0].signOffCommits, true)

      rerender({ isCreatingCopilotAssistedCommits: true })
      assert.ok(coAuthorsInput instanceof HTMLInputElement)
      assert.strictEqual(coAuthorsInput.readOnly, true)
    })

    it('preserves option availability for local repositories and contexts without empty commits', async t => {
      const { menus, select } = captureOptionsMenu(t)
      renderWithCommitModes({
        repository: new Repository(process.cwd(), 123, null, false),
        commitMode: 'copilot',
        showAllowEmptyCommitOption: false,
      })
      select(AddCoAuthorsLabel)
      await waitFor(() => assert.strictEqual(menus.length, 1))
      assert.strictEqual(menus[0][0].enabled, false)
      assert.strictEqual(
        menus[0].some(item => item.label === AllowEmptyLabel),
        false
      )
    })

    it('rejects an option selection if the operation becomes busy while the native menu is open', async t => {
      let resolveSelection:
        | ((indices: ReadonlyArray<number> | null) => void)
        | null = null
      const selection = new Promise<ReadonlyArray<number> | null>(resolve => {
        resolveSelection = resolve
      })
      const updates = new Array<Partial<CommitOptions>>()
      let signOffIndex = -1
      t.mock.method(
        ipcRenderer,
        'invoke',
        (channel: string, items: ReadonlyArray<ISerializableMenuItem>) => {
          assert.strictEqual(channel, 'show-contextual-menu')
          signOffIndex = items.findIndex(item => item.label === SignOffLabel)
          return selection
        }
      )
      const { rerender } = renderWithCommitModes({
        commitMode: 'copilot',
        onUpdateCommitOptions: (_repository, options) => updates.push(options),
      })
      fireEvent.click(
        screen.getByRole('button', {
          name: 'Configure commit options',
        })
      )
      assert.ok(signOffIndex >= 0)
      rerender({ isCreatingCopilotAssistedCommits: true })
      assert.ok(resolveSelection)
      const finishSelection: (indices: ReadonlyArray<number> | null) => void =
        resolveSelection
      finishSelection([signOffIndex])
      await new Promise<void>(resolve => setImmediate(resolve))
      assert.deepStrictEqual(updates, [])
    })

    it('disables co-author removal by mouse and keyboard while assisted commits are busy', () => {
      const repository = createMountableRepository()
      assert.ok(repository.gitHubRepository)
      const authorUpdates = new Array<ReadonlyArray<unknown>>()
      const { rerender } = renderWithCommitModes({
        repository,
        commitMode: 'copilot',
        autocompletionProviders: [
          new CoAuthorAutocompletionProvider(
            createTestGitHubUserStore(),
            repository.gitHubRepository
          ),
        ],
        showCoAuthoredBy: true,
        coAuthors: [
          {
            kind: 'known',
            name: 'Mona Lisa',
            email: 'mona@example.com',
            username: 'mona',
          },
        ],
        onCoAuthorsUpdated: authors => authorUpdates.push(authors),
      })
      rerender({ isCreatingCopilotAssistedCommits: true })
      const author = screen.getByRole('option', { name: /Mona Lisa/ })
      const remove = within(author).getByRole('button')
      assert.ok(remove instanceof HTMLButtonElement)
      assert.strictEqual(remove.disabled, true)
      fireEvent.click(remove)
      author.focus()
      fireEvent.keyDown(author, { key: 'Delete' })
      assert.deepStrictEqual(authorUpdates, [])
      assert.strictEqual(screen.queryByText(/^Removed mona/), null)
      assert.ok(screen.getByRole('option', { name: /Mona Lisa/ }))
    })

    it('cancels a queued description scroll check on unmount', t => {
      let lastFrameID = 0
      const frames = t.mock.method(
        globalThis,
        'requestAnimationFrame',
        () => ++lastFrameID
      )
      const cancel = t.mock.method(globalThis, 'cancelAnimationFrame', () => {})
      const { view } = renderWithCommitModes()
      const beforeScroll = frames.mock.calls.length
      fireEvent.scroll(
        screen.getByRole('combobox', {
          name: 'Commit description',
        })
      )
      assert.strictEqual(frames.mock.calls.length, beforeScroll + 1)
      const pendingFrameID = lastFrameID
      view.unmount()
      assert.ok(
        cancel.mock.calls.some(call => call.arguments[0] === pendingFrameID)
      )
    })

    it('never announces transient assisted commits as completed before acceptance', async () => {
      const commit = createCommit()
      const harness = renderWithCommitModes({
        commitMode: 'copilot',
        isCreatingCopilotAssistedCommits: true,
        assistedCommitState: {
          kind: 'finishing',
          runId: 'run',
          cancelRequested: false,
        },
        mostRecentLocalCommit: null,
      })
      harness.rerender({ mostRecentLocalCommit: commit })
      await waitFor(() => {
        const live = harness.view.container.querySelector(
          'span[aria-live="polite"][aria-atomic="true"]'
        )
        assert.ok(live)
        assert.ok(!live.textContent?.includes('Committed Just now'))
      })
    })

    it('honors both unknown-coauthor and hidden-file confirmations before dispatch', () => {
      let confirmAuthors: (() => void) | null = null
      let confirmFiles: (() => void) | null = null
      const { requests } = renderWithCommitModes({
        commitMode: 'copilot',
        coAuthors: [{ kind: 'unknown', username: 'missing', state: 'error' }],
        showPromptForCommittingFileHiddenByFilter: true,
        onConfirmCommitWithUnknownCoAuthors: (_authors, proceed) => {
          confirmAuthors = proceed
        },
        onFilesToCommitNotVisible: proceed => {
          confirmFiles = proceed
        },
      })
      fireEvent.click(
        screen.getByRole('button', {
          name: 'Commit 1 file to main with Copilot',
        })
      )
      assert.strictEqual(requests.length, 0)
      assert.ok(confirmAuthors)
      const acceptAuthors: () => void = confirmAuthors
      acceptAuthors()
      assert.strictEqual(requests.length, 0)
      assert.ok(confirmFiles)
      const acceptFiles: () => void = confirmFiles
      acceptFiles()
      assert.strictEqual(requests.length, 1)
      assert.deepStrictEqual(requests[0].trailers, [])
    })
  })
})
