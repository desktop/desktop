import * as React from 'react'
import { Dispatcher } from '../dispatcher'
import {
  SignInState,
  SignInStep,
  IEndpointEntryState,
  IAuthenticationState,
  IExistingAccountWarning,
} from '../../lib/stores'
import { assertNever } from '../../lib/fatal-error'
import { Row } from '../lib/row'
import { TextBox } from '../lib/text-box'
import { Dialog, DialogError, DialogContent, DialogFooter } from '../dialog'

import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { Ref } from '../lib/ref'
import { getHTMLURL } from '../../lib/api'
import { isDotCom } from '../../lib/endpoint-capabilities'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'

interface ISignInProps {
  readonly dispatcher: Dispatcher
  readonly signInState: SignInState | null
  readonly onDismissed: () => void
  readonly isCredentialHelperSignIn?: boolean
  readonly credentialHelperUrl?: string
}

interface ISignInState {
  readonly endpoint: string
  readonly authMethod: 'browser' | 'ssh' | null
}

const SignInWithBrowserTitle = __DARWIN__
  ? 'Sign in Using Your Browser'
  : 'Sign in using your browser'

const DefaultTitle = 'Sign in'

const browserSignInInfoContent = (
  <p>
    Your browser will redirect you back to GitHub Desktop once you've signed in.
    If your browser asks for your permission to launch GitHub Desktop, please
    allow it.
  </p>
)

export class SignIn extends React.Component<ISignInProps, ISignInState> {
  private readonly dialogRef = React.createRef<Dialog>()

  public constructor(props: ISignInProps) {
    super(props)

    this.state = {
      endpoint: '',
      authMethod: null,
    }
  }

  public componentDidUpdate(prevProps: ISignInProps) {
    if (prevProps.signInState !== null && this.props.signInState !== null) {
      if (prevProps.signInState.kind !== this.props.signInState.kind) {
        this.dialogRef.current?.focusFirstSuitableChild()
      }
    }
  }

  public componentWillReceiveProps(nextProps: ISignInProps) {
    if (nextProps.signInState !== this.props.signInState) {
      if (
        nextProps.signInState &&
        nextProps.signInState.kind === SignInStep.Success
      ) {
        this.onDismissed()
      }
      if (
        nextProps.signInState &&
        nextProps.signInState.kind === SignInStep.Authentication
      ) {
        this.setState({ authMethod: null })
      }
    }
  }

  private onSubmit = () => {
    const state = this.props.signInState

    if (!state) {
      return
    }

    const stepKind = state.kind

    switch (state.kind) {
      case SignInStep.EndpointEntry:
        this.props.dispatcher.setSignInEndpoint(this.state.endpoint)
        break
      case SignInStep.ExistingAccountWarning:
        this.props.dispatcher
          .removeAccount(state.existingAccount)
          .then(() => this.props.dispatcher.setSignInEndpoint(state.endpoint))
        break
      case SignInStep.Authentication:
        if (this.state.authMethod === 'ssh') {
          this.onDismissed()
        } else {
          this.props.dispatcher.requestBrowserAuthentication()
        }
        break
      case SignInStep.Success:
        this.onDismissed()
        break
      default:
        assertNever(state, `Unknown sign in step ${stepKind}`)
    }
  }

  private onEndpointChanged = (endpoint: string) => {
    this.setState({ endpoint })
  }

  private onSelectBrowserAuth = () => {
    this.setState({ authMethod: 'browser' })
  }

  private onSelectSSHSetup = () => {
    this.setState({ authMethod: 'ssh' })
  }

  private renderFooter(): JSX.Element | null {
    const state = this.props.signInState

    if (!state || state.kind === SignInStep.Success) {
      return null
    }

    let disableSubmit = false

    let primaryButtonText: string
    const stepKind = state.kind
    const continueWithBrowserLabel = __DARWIN__
      ? 'Continue With Browser'
      : 'Continue with browser'

    switch (state.kind) {
      case SignInStep.EndpointEntry:
        disableSubmit = this.state.endpoint.length === 0
        primaryButtonText = 'Continue'
        break
      case SignInStep.ExistingAccountWarning:
        primaryButtonText = continueWithBrowserLabel
        break
      case SignInStep.Authentication:
        if (this.state.authMethod === 'ssh') {
          primaryButtonText = __DARWIN__ ? 'Done' : 'Done'
        } else if (this.state.authMethod === 'browser') {
          primaryButtonText = continueWithBrowserLabel
        } else {
          return null
        }
        break
      default:
        return assertNever(state, `Unknown sign in step ${stepKind}`)
    }

    return (
      <DialogFooter>
        <OkCancelButtonGroup
          okButtonText={primaryButtonText}
          okButtonDisabled={disableSubmit || state.loading}
          cancelButtonDisabled={false}
          onCancelButtonClick={this.onDismissed}
        />
      </DialogFooter>
    )
  }

  private renderExistingAccountWarningStep(state: IExistingAccountWarning) {
    return (
      <DialogContent>
        <p className="existing-account-warning">
          You're already signed in to{' '}
          <Ref>{new URL(getHTMLURL(state.endpoint)).host}</Ref> with the account{' '}
          <Ref>{state.existingAccount.login}</Ref>. If you continue, you will
          first be signed out.
        </p>
        {browserSignInInfoContent}
      </DialogContent>
    )
  }

  private renderEndpointEntryStep(state: IEndpointEntryState) {
    return (
      <DialogContent>
        <Row>
          <TextBox
            label="Enterprise address"
            value={this.state.endpoint}
            onValueChanged={this.onEndpointChanged}
            placeholder="https://example.ghe.com"
          />
        </Row>
      </DialogContent>
    )
  }

  private renderSSHSetupInstructions() {
    return (
      <DialogContent>
        <p>
          To use SSH authentication with this account, follow these steps:
        </p>
        <ol>
          <li>
            Open a terminal and generate an SSH key pair:
            <pre style={{ userSelect: 'all' }}>
              ssh-keygen -t ed25519 -C "your-email@example.com"
            </pre>
          </li>
          <li>
            Copy the public key to your clipboard:
            <pre style={{ userSelect: 'all' }}>
              cat ~/.ssh/id_ed25519.pub | clip
            </pre>
          </li>
          <li>
            Go to{' '}
            <Ref>https://github.com/settings/keys</Ref>{' '}
            and click "New SSH key". Paste the public key and save.
          </li>
          <li>
            Add the following to your <Ref>~/.ssh/config</Ref>:
            <pre>
              {`Host github.com-username
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_ed25519`}
            </pre>
          </li>
          <li>
            Test the connection:
            <pre style={{ userSelect: 'all' }}>
              ssh -T github.com-username
            </pre>
          </li>
        </ol>
        <p>
          After setting up SSH, you can assign this account to repositories by
          selecting it in the repository settings.
        </p>
      </DialogContent>
    )
  }

  private renderAuthenticationStep(state: IAuthenticationState) {
    const credentialHelperInfo =
      this.props.isCredentialHelperSignIn && this.props.credentialHelperUrl ? (
        <p>
          Git requesting credentials to access{' '}
          <Ref>{this.props.credentialHelperUrl}</Ref>.
        </p>
      ) : undefined

    if (this.state.authMethod === 'ssh') {
      return this.renderSSHSetupInstructions()
    }

    if (this.state.authMethod === 'browser') {
      return (
        <DialogContent>
          {credentialHelperInfo}
          {browserSignInInfoContent}
        </DialogContent>
      )
    }

    if (isDotCom(state.endpoint)) {
      return (
        <DialogContent>
          {credentialHelperInfo}
          <p>Choose how you'd like to authenticate this account:</p>
          <div className="sign-in-method-choices">
            <button
              className="sign-in-method-choice"
              onClick={this.onSelectBrowserAuth}
              autoFocus={true}
            >
              <Octicon symbol={octicons.globe} />
              <span className="sign-in-method-choice-title">
                Sign in using browser
              </span>
              <span className="sign-in-method-choice-description">
                Authenticate via GitHub.com using your web browser (recommended)
              </span>
            </button>
            <button
              className="sign-in-method-choice"
              onClick={this.onSelectSSHSetup}
            >
              <Octicon symbol={octicons.key} />
              <span className="sign-in-method-choice-title">
                Set up SSH key
              </span>
              <span className="sign-in-method-choice-description">
                Generate or configure an SSH key for command-line access
              </span>
            </button>
          </div>
        </DialogContent>
      )
    }

    return (
      <DialogContent>
        {credentialHelperInfo}
        {browserSignInInfoContent}
      </DialogContent>
    )
  }

  private renderStep(): JSX.Element | null {
    const state = this.props.signInState

    if (!state) {
      return null
    }

    const stepKind = state.kind

    switch (state.kind) {
      case SignInStep.EndpointEntry:
        return this.renderEndpointEntryStep(state)
      case SignInStep.ExistingAccountWarning:
        return this.renderExistingAccountWarningStep(state)
      case SignInStep.Authentication:
        return this.renderAuthenticationStep(state)
      case SignInStep.Success:
        return null
      default:
        return assertNever(state, `Unknown sign in step ${stepKind}`)
    }
  }

  public render() {
    const state = this.props.signInState

    if (!state || state.kind === SignInStep.Success) {
      return null
    }

    const errors = state.error ? (
      <DialogError>{state.error.message}</DialogError>
    ) : null

    let title: string
    if (state.kind === SignInStep.Authentication) {
      if (this.state.authMethod === 'ssh') {
        title = __DARWIN__ ? 'Set Up SSH Key' : 'Set up SSH key'
      } else if (this.state.authMethod === 'browser') {
        title = SignInWithBrowserTitle
      } else {
        title = DefaultTitle
      }
    } else {
      title = DefaultTitle
    }

    return (
      <Dialog
        id="sign-in"
        title={title}
        disabled={false}
        onDismissed={this.onDismissed}
        onSubmit={this.onSubmit}
        loading={state.loading}
        ref={this.dialogRef}
      >
        {errors}
        {this.renderStep()}
        {this.renderFooter()}
      </Dialog>
    )
  }

  private onDismissed = () => {
    this.props.dispatcher.resetSignInState()
    this.props.onDismissed()
  }
}
