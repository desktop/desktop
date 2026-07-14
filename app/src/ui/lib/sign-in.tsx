import * as React from 'react'
import { AuthenticationForm } from './authentication-form'
import { assertNever } from '../../lib/fatal-error'
import { EnterpriseServerEntry } from '../lib/enterprise-server-entry'
import { Dispatcher } from '../dispatcher'
import {
  SignInState,
  SignInStep,
  IEndpointEntryState,
  IAuthenticationState,
  IExistingAccountWarning,
} from '../../lib/stores'
import { Ref } from './ref'
import { getHTMLURL } from '../../lib/api'

interface ISignInProps {
  readonly signInState: SignInState
  readonly dispatcher: Dispatcher
}

/**
 * The sign in flow for GitHub.
 *
 * Provide `children` elements to render additional buttons in the active form.
 */
export class SignIn extends React.Component<ISignInProps, {}> {
  private onEndpointEntered = (url: string) => {
    this.props.dispatcher.setSignInEndpoint(url)
  }

  private onBrowserSignInRequested = () => {
    this.props.dispatcher.requestBrowserAuthentication()
  }

  private renderExistingAccountWarningStep(state: IExistingAccountWarning) {
    return (
      <>
        <p className="existing-account-warning">
          You're already signed in to{' '}
          <Ref>{new URL(getHTMLURL(state.endpoint)).host}</Ref> with the account{' '}
          <Ref>{state.existingAccount.login}</Ref>. If you continue, you will
          first be signed out.
        </p>
        {this.renderAuthenticationStep(state)}
      </>
    )
  }

  private renderEndpointEntryStep(
    state: IEndpointEntryState | IExistingAccountWarning
  ) {
    const children = this.props.children as ReadonlyArray<JSX.Element>
    return (
      <EnterpriseServerEntry
        loading={state.loading}
        error={state.error}
        onSubmit={this.onEndpointEntered}
        additionalButtons={children}
      />
    )
  }

  private renderAuthenticationStep(
    state: IAuthenticationState | IExistingAccountWarning
  ) {
    const children = this.props.children as ReadonlyArray<JSX.Element>

    return (
      <AuthenticationForm
        additionalButtons={children}
        onBrowserSignInRequested={this.onBrowserSignInRequested}
      />
    )
  }

  public render() {
    const state = this.props.signInState
    const stepText = this.props.signInState.kind

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
        return assertNever(state, `Unknown sign-in step: ${stepText}`)
    }
  }
}
