import assert from 'node:assert'
import { afterEach, beforeEach, describe, it } from 'node:test'
import * as React from 'react'

import { Account } from '../../../src/models/account'
import type {
  IAuthenticationState,
  IConfirmEndpointState,
  IEndpointEntryState,
  IExistingAccountWarning,
} from '../../../src/lib/stores/sign-in-store'
import {
  SignInStep,
  SignInStore,
  SignInResult,
} from '../../../src/lib/stores/sign-in-store'
import type { Dispatcher } from '../../../src/ui/dispatcher'
import { ConfigureGit } from '../../../src/ui/welcome/configure-git'
import { SignInEnterprise } from '../../../src/ui/welcome/sign-in-enterprise'
import { SignIn } from '../../../src/ui/lib/sign-in'
import { SignIn as SignInDialog } from '../../../src/ui/sign-in/sign-in'
import { trampolineUIHelper } from '../../../src/lib/trampoline/trampoline-ui-helper'
import { Popup, PopupType } from '../../../src/models/popup'
import { createTestSignInStore } from '../../helpers/app-store-test-harness'
import { fireEvent, render, screen, waitFor } from '../../helpers/ui/render'

function noopResultCallback() {}

class TestDispatcher {
  public readonly enteredEndpoints = new Array<string>()
  public readonly endpointConfirmations = new Array<boolean>()
  public readonly popups = new Array<Popup>()
  public browserSignInCount = 0
  public resetCount = 0
  public closedPopupCount = 0

  public constructor(private readonly signInStore?: SignInStore) {}

  public async setSignInEndpoint(url: string, requireConfirmation = false) {
    this.enteredEndpoints.push(url)
    this.endpointConfirmations.push(requireConfirmation)
    await this.signInStore?.setEndpoint(url, requireConfirmation)
  }

  public requestBrowserAuthentication() {
    this.browserSignInCount++
  }

  public beginEnterpriseSignIn(callback?: (result: SignInResult) => void) {
    this.signInStore?.beginEnterpriseSignIn(callback)
  }

  public beginDotComSignIn(callback?: (result: SignInResult) => void) {
    this.signInStore?.beginDotComSignIn(callback)
  }

  public resetSignInState() {
    this.resetCount++
    this.signInStore?.reset()
  }

  public showPopup(popup: Popup) {
    this.popups.push(popup)
  }

  public closePopup() {
    this.closedPopupCount++
  }
}

function toDispatcher(dispatcher: TestDispatcher): Dispatcher {
  return dispatcher as unknown as Dispatcher
}

function createEndpointState(): IEndpointEntryState {
  return {
    kind: SignInStep.EndpointEntry,
    error: null,
    loading: false,
    resultCallback: noopResultCallback,
  }
}

function createAuthenticationState(endpoint: string): IAuthenticationState {
  return {
    kind: SignInStep.Authentication,
    endpoint,
    error: null,
    loading: false,
    resultCallback: noopResultCallback,
  }
}

function createConfirmationState(): IConfirmEndpointState {
  return {
    kind: SignInStep.ConfirmEndpoint,
    endpoint: 'https://enterprise.example.com/api/v3',
    error: null,
    loading: false,
    resultCallback: noopResultCallback,
  }
}

function createExistingAccountWarningState(): IExistingAccountWarning {
  return {
    kind: SignInStep.ExistingAccountWarning,
    endpoint: 'https://api.github.com',
    existingAccount: new Account(
      'mona',
      'https://api.github.com',
      'token',
      [],
      '',
      1,
      'Mona Lisa'
    ),
    error: null,
    loading: false,
    resultCallback: noopResultCallback,
  }
}

describe('welcome and sign-in wrappers', () => {
  let restoreIpcSend: (() => void) | undefined

  beforeEach(async () => {
    const electron = await import('electron')
    const previousSend = electron.ipcRenderer.send
    electron.ipcRenderer.send = () => {}
    restoreIpcSend = () => {
      electron.ipcRenderer.send = previousSend
    }
  })

  afterEach(() => {
    restoreIpcSend?.()
  })

  it('confirms the endpoint before offering browser sign-in in the shared wrapper', async () => {
    const dispatcher = new TestDispatcher()
    const state = createConfirmationState()
    render(
      <SignIn signInState={state} dispatcher={toDispatcher(dispatcher)}>
        <button type="button">Cancel</button>
      </SignIn>
    )

    assert.ok(screen.getByText('https://enterprise.example.com'))
    const checks = screen.getAllByRole('listitem')
    assert.strictEqual(checks.length, 2)
    assert.match(checks[0].textContent ?? '', /Only continue if you trust it/)
    assert.match(
      checks[1].textContent ?? '',
      /Before authorizing GitHub Desktop, make sure the page is on this server's domain/
    )
    assert.ok(
      screen.getByText(/Your organization may use a separate sign-in provider/)
    )
    assert.ok(screen.getByText(/Not sure\? Cancel and check/))
    assert.strictEqual(
      screen.queryByRole('link', { name: /sign in using your browser/i }),
      null
    )
    fireEvent.click(screen.getByRole('button', { name: /trust server/i }))

    assert.deepStrictEqual(dispatcher.enteredEndpoints, [state.endpoint])
    assert.deepStrictEqual(dispatcher.endpointConfirmations, [false])
    assert.strictEqual(dispatcher.browserSignInCount, 0)
  })

  it('shows the Git-requested server before allowing browser sign-in', async () => {
    const store = createTestSignInStore()
    const dispatcher = new TestDispatcher(store)
    trampolineUIHelper.setDispatcher(toDispatcher(dispatcher))
    const result = trampolineUIHelper.promptForGitHubSignIn(
      'https://enterprise.example.com/team/project.git'
    )
    await waitFor(() => assert.strictEqual(dispatcher.popups.length, 1))

    assert.strictEqual(store.getState()?.kind, SignInStep.ConfirmEndpoint)
    assert.deepStrictEqual(dispatcher.endpointConfirmations, [true])
    assert.strictEqual(dispatcher.popups[0].type, PopupType.SignIn)

    const view = render(
      <SignInDialog
        signInState={store.getState()}
        dispatcher={toDispatcher(dispatcher)}
        onDismissed={noopResultCallback}
        isCredentialHelperSignIn={true}
        credentialHelperUrl="https://enterprise.example.com/team/project.git"
      />
    )

    const dialog = screen.getByRole('alertdialog', { hidden: true })
    assert.strictEqual(
      dialog.getAttribute('aria-describedby'),
      'enterprise-server-confirmation-description'
    )
    assert.notStrictEqual(
      document.getElementById(
        dialog.getAttribute('aria-describedby') ?? 'missing-description'
      ),
      null
    )
    assert.ok(screen.getByText('https://enterprise.example.com'))
    assert.ok(screen.getByText(/Only continue if you trust it/))
    assert.strictEqual(
      screen.queryByRole('button', {
        name: /continue with browser/i,
        hidden: true,
      }),
      null
    )
    assert.strictEqual(dispatcher.browserSignInCount, 0)

    fireEvent.click(
      screen.getByRole('button', { name: /trust server/i, hidden: true })
    )
    await waitFor(() =>
      assert.strictEqual(store.getState()?.kind, SignInStep.Authentication)
    )
    assert.strictEqual(dispatcher.browserSignInCount, 0)
    assert.deepStrictEqual(dispatcher.enteredEndpoints, [
      'https://enterprise.example.com',
      'https://enterprise.example.com/api/v3',
    ])

    view.rerender(
      <SignInDialog
        signInState={store.getState()}
        dispatcher={toDispatcher(dispatcher)}
        onDismissed={noopResultCallback}
        isCredentialHelperSignIn={true}
        credentialHelperUrl="https://enterprise.example.com/team/project.git"
      />
    )
    assert.notStrictEqual(screen.getByRole('dialog', { hidden: true }), null)
    fireEvent.click(
      screen.getByRole('button', {
        name: /continue with browser/i,
        hidden: true,
      })
    )
    assert.strictEqual(dispatcher.browserSignInCount, 1)

    fireEvent.click(
      screen.getByRole('button', { name: 'Cancel', hidden: true })
    )
    assert.strictEqual(await result, undefined)
    assert.strictEqual(dispatcher.closedPopupCount, 1)
  })

  it('cancels the Git credential request without opening the browser', async () => {
    const store = createTestSignInStore()
    const dispatcher = new TestDispatcher(store)
    trampolineUIHelper.setDispatcher(toDispatcher(dispatcher))
    const result = trampolineUIHelper.promptForGitHubSignIn(
      'https://enterprise.example.com/team/project.git'
    )
    await waitFor(() => assert.strictEqual(dispatcher.popups.length, 1))
    let dismissedCount = 0
    render(
      <SignInDialog
        signInState={store.getState()}
        dispatcher={toDispatcher(dispatcher)}
        onDismissed={() => dismissedCount++}
        isCredentialHelperSignIn={true}
      />
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'Cancel', hidden: true })
    )

    assert.strictEqual(await result, undefined)
    assert.strictEqual(store.getState(), null)
    assert.strictEqual(dispatcher.resetCount, 1)
    assert.strictEqual(dismissedCount, 1)
    assert.strictEqual(dispatcher.browserSignInCount, 0)
  })

  it('submits enterprise endpoints through the shared sign-in wrapper', () => {
    const dispatcher = new TestDispatcher()

    render(
      <SignIn
        signInState={createEndpointState()}
        dispatcher={toDispatcher(dispatcher)}
      >
        <button type="button">Cancel</button>
      </SignIn>
    )

    const input = screen.getByLabelText('Enterprise address')
    const continueButton = screen.getByRole('button', { name: 'Continue' })

    fireEvent.change(input, {
      target: { value: 'https://enterprise.example.com' },
    })
    fireEvent.click(continueButton)

    assert.deepEqual(dispatcher.enteredEndpoints, [
      'https://enterprise.example.com',
    ])
    assert.ok(screen.getByRole('button', { name: 'Cancel' }))
  })

  it('renders warning and browser-authentication states in the shared sign-in wrapper', () => {
    const dispatcher = new TestDispatcher()
    const view = render(
      <SignIn
        signInState={createExistingAccountWarningState()}
        dispatcher={toDispatcher(dispatcher)}
      >
        <button type="button">Cancel</button>
      </SignIn>
    )

    assert.ok(screen.getByText("You're already signed in to", { exact: false }))
    assert.ok(screen.getByText('github.com', { exact: false }))
    assert.ok(screen.getByText('mona'))

    const browserLink = screen.getByRole('link', {
      name: 'Sign in using your browser',
    })

    fireEvent.click(browserLink)

    assert.equal(dispatcher.browserSignInCount, 1)

    view.rerender(
      <SignIn
        signInState={{
          kind: SignInStep.Success,
          resultCallback: noopResultCallback,
        }}
        dispatcher={toDispatcher(dispatcher)}
      />
    )

    assert.equal(view.container.textContent, '')
  })

  it('renders the enterprise welcome step only when sign-in state exists and its cancel button returns to start', () => {
    const dispatcher = new TestDispatcher()
    const advancedSteps = new Array<string>()

    function advance(step: string) {
      advancedSteps.push(step)
    }

    const view = render(
      <SignInEnterprise
        dispatcher={toDispatcher(dispatcher)}
        advance={advance}
        signInState={null}
      />
    )

    assert.equal(view.container.textContent, '')

    view.rerender(
      <SignInEnterprise
        dispatcher={toDispatcher(dispatcher)}
        advance={advance}
        signInState={createAuthenticationState('https://api.github.com')}
      />
    )

    assert.ok(screen.getByText('Sign in to your GitHub Enterprise'))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    assert.deepEqual(advancedSteps, ['Start'])
  })

  it('renders the configure-git welcome step and returns to start when cancelled', () => {
    const advancedSteps = new Array<string>()
    let doneCount = 0

    function advance(step: string) {
      advancedSteps.push(step)
    }

    function done() {
      doneCount++
    }

    render(
      <ConfigureGit
        accounts={[]}
        advance={advance}
        done={done}
        globalUserName={undefined}
        globalUserEmail={undefined}
      />
    )

    assert.ok(screen.getByText('Configure Git'))
    assert.ok(
      screen.getByText('This is used to identify the commits you create.', {
        exact: false,
      })
    )
    assert.ok(screen.getByRole('button', { name: 'Finish' }))

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    assert.deepEqual(advancedSteps, ['Start'])
    assert.equal(doneCount, 0)
  })
})
