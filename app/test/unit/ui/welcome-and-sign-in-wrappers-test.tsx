import assert from 'node:assert'
import { afterEach, beforeEach, describe, it } from 'node:test'
import * as React from 'react'

import type {
  IAuthenticationState,
  IEndpointEntryState,
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
import { PopupType } from '../../../src/models/popup'
import { fireEvent, render, screen } from '../../helpers/ui/render'

function noopResultCallback() {}

class TestDispatcher {
  public readonly enteredEndpoints = new Array<string>()
  public readonly confirmationGuidanceRequests = new Array<boolean>()
  public browserSignInCount = 0
  public resetCount = 0
  public closedPopupCount = 0

  public constructor(private readonly signInStore?: SignInStore) {}

  public async setSignInEndpoint(url: string, isEndpointFromGit = false) {
    this.enteredEndpoints.push(url)
    this.confirmationGuidanceRequests.push(isEndpointFromGit)
    await this.signInStore?.setEndpoint(url, isEndpointFromGit)
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

function createConfirmationState(): IAuthenticationState {
  return {
    kind: SignInStep.Authentication,
    endpoint: 'https://enterprise.example.com/api/v3',
    isUnrecognizedEnterpriseServer: true,
    error: null,
    loading: false,
    resultCallback: noopResultCallback,
  }
}

describe('welcome and sign-in wrappers', () => {
  it('only closes the sign-in popup on success, even after the callback closed both nested dialogs', t => {
    const dispatcher = new TestDispatcher()
    const popupStack = [
      PopupType.Preferences,
      PopupType.RepositoryAccount,
      PopupType.SignIn,
    ]
    const closedTypes: Array<PopupType | undefined> = []
    t.mock.method(dispatcher, 'closePopup', (type?: PopupType) => {
      closedTypes.push(type)
      if (popupStack[popupStack.length - 1] === type) {
        popupStack.pop()
      }
    })
    const onDismissed = () => {
      popupStack.pop()
    }
    const view = render(
      <SignInDialog
        dispatcher={toDispatcher(dispatcher)}
        signInState={createAuthenticationState('https://api.github.com')}
        onDismissed={onDismissed}
      />
    )
    // The result callback has already closed SignIn and RepositoryAccount.
    popupStack.pop()
    popupStack.pop()
    const success = {
      kind: SignInStep.Success as const,
      resultCallback: noopResultCallback,
    }
    view.rerender(
      <SignInDialog
        dispatcher={toDispatcher(dispatcher)}
        signInState={success}
        onDismissed={onDismissed}
      />
    )
    view.rerender(
      <SignInDialog
        dispatcher={toDispatcher(dispatcher)}
        signInState={{ ...success }}
        onDismissed={onDismissed}
      />
    )
    assert.deepStrictEqual(popupStack, [PopupType.Preferences])
    assert.deepStrictEqual(closedTypes, [PopupType.SignIn])
    assert.strictEqual(dispatcher.resetCount, 0)
  })

  it('closes normal sign-in successfully without cancelling or dismissing its parent', t => {
    const dispatcher = new TestDispatcher()
    const closedTypes: Array<PopupType | undefined> = []
    let dismissed = 0
    t.mock.method(dispatcher, 'closePopup', (type?: PopupType) => {
      closedTypes.push(type)
    })
    const onDismissed = () => dismissed++
    const view = render(
      <SignInDialog
        dispatcher={toDispatcher(dispatcher)}
        signInState={createAuthenticationState('https://api.github.com')}
        onDismissed={onDismissed}
      />
    )
    view.rerender(
      <SignInDialog
        dispatcher={toDispatcher(dispatcher)}
        signInState={{
          kind: SignInStep.Success,
          resultCallback: noopResultCallback,
        }}
        onDismissed={onDismissed}
      />
    )
    assert.deepStrictEqual(closedTypes, [PopupType.SignIn])
    assert.strictEqual(dispatcher.resetCount, 0)
    assert.strictEqual(dismissed, 0)
    assert.strictEqual(view.container.textContent, '')
  })

  it('shows the required account and host for targeted reauthentication', () => {
    render(
      <SignInDialog
        signInState={{
          ...createAuthenticationState('https://api.github.com'),
          expectedLogin: 'work-account',
        }}
        dispatcher={toDispatcher(new TestDispatcher())}
        onDismissed={noopResultCallback}
      />
    )
    assert.ok(screen.getByText('work-account'))
    assert.ok(screen.getByText('github.com'))
    assert.ok(screen.getByText(/Sign in as/))
  })

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

  it('shows server guidance alongside browser sign-in in the shared wrapper', async () => {
    const dispatcher = new TestDispatcher()
    const state = createConfirmationState()
    render(
      <SignIn signInState={state} dispatcher={toDispatcher(dispatcher)}>
        <button type="button">Cancel</button>
      </SignIn>
    )

    assert.ok(screen.getByText('https://enterprise.example.com'))
    assert.ok(
      screen.getByText(
        'Git is requesting permission to sign in to this server:'
      )
    )
    assert.ok(
      screen.getByText('Only continue if you recognize and trust this server.')
    )
    assert.ok(
      screen.getByText(
        /Confirm this address appears in your browser\. Otherwise, cancel and contact your repository administrator\./
      )
    )
    assert.strictEqual(screen.queryByRole('list'), null)
    const warning = document.querySelector('.enterprise-server-warning')
    assert.ok(warning)
    assert.strictEqual(
      warning.querySelector('svg')?.getAttribute('aria-hidden'),
      'true'
    )
    fireEvent.click(
      screen.getByRole('link', { name: /sign in using your browser/i })
    )

    assert.deepStrictEqual(dispatcher.enteredEndpoints, [])
    assert.deepStrictEqual(dispatcher.confirmationGuidanceRequests, [])
    assert.strictEqual(dispatcher.browserSignInCount, 1)
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

  it('renders browser-authentication and success states in the shared sign-in wrapper', () => {
    const dispatcher = new TestDispatcher()
    const view = render(
      <SignIn
        signInState={createAuthenticationState('https://api.github.com')}
        dispatcher={toDispatcher(dispatcher)}
      >
        <button type="button">Cancel</button>
      </SignIn>
    )

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
