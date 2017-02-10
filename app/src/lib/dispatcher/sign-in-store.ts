import { Emitter, Disposable } from 'event-kit'
import { User } from '../../models/user'
import {
  createAuthorization,
  AuthorizationResponse,
  fetchUser,
  AuthorizationResponseKind,
  getHTMLURL,
  getDotComAPIEndpoint,
} from '../../lib/api'

export enum Step {
  EndpointEntry,
  Authentication,
  TwoFactorAuthentication,
}

/** The authentication methods server allows. */
export enum AuthenticationMethods {
  /** Basic auth in order to create authorization tokens. */
  BasicAuth,

  /** OAuth web flow. */
  OAuth,
}

/** The default set of authentication methods. */
export const DefaultAuthMethods = new Set([
  AuthenticationMethods.BasicAuth,
  AuthenticationMethods.OAuth,
])

export type SignInStep = IEndpointEntryStep | IAuthenticationStep | ITwoFactorAuthenticationStep

export interface ISignInStep {
  readonly kind: Step
  readonly error?: Error,
  readonly loading?: boolean,
}

export interface IEndpointEntryStep extends ISignInStep {
  readonly kind: Step.EndpointEntry
}

export interface IAuthenticationStep extends ISignInStep {
  readonly kind: Step.Authentication
  readonly endpoint: string,
  readonly authMethods: Set<AuthenticationMethods>
}

export interface ITwoFactorAuthenticationStep extends ISignInStep {
  readonly kind: Step.TwoFactorAuthentication
  readonly endpoint: string,
  readonly username: string,
  readonly password: string
}

export class SignInStore {
  private readonly emitter = new Emitter()
  private state: SignInStep | null = null

  public SignInStore() {

  }

  private emitUpdate() {
    this.emitter.emit('did-update', this.getState())
  }

  private emitAuthenticate(user: User) {
    this.emitter.emit('did-authenticate', user)
  }

  private emitError(error: Error) {
    this.emitter.emit('did-error', error)
  }

  /** Register a function to be called when the store updates. */
  public onDidUpdate(fn: () => void): Disposable {
    return this.emitter.on('did-update', fn)
  }

  /**
   * Register a function to be called when the store successfully
   * authenticates a user.
   */
  public onDidAuthenticate(fn: () => void): Disposable {
    return this.emitter.on('did-authenticate', fn)
  }

  /** Register a function to be called when an error occurs. */
  public onDidError(fn: (error: Error) => void): Disposable {
    return this.emitter.on('did-error', fn)
  }

  public getState(): SignInStep | null {
    return this.state
  }

  private setState(state: SignInStep | null) {
    this.state = state
    this.emitUpdate()
  }

  public reset() {
    this.setState(null)
  }

  public beginDotComSignIn() {
    this.setState({
      kind: Step.Authentication,
      endpoint: getDotComAPIEndpoint(),
      authMethods: DefaultAuthMethods,
    })
  }

  public async authenticateWithBasicAuth(username: string, password: string): Promise<void> {
    const step = this.state

    if (!step || step.kind !== Step.Authentication) {
      const stepText = step ? step.kind : 'null'
      this.emitError(new Error(`Sign in step '${stepText}' not compatible with authentication`))
      return
    }

    const endpoint = step.endpoint

    this.setState({ ...step, loading: true })

    let response: AuthorizationResponse
    try {
      response = await createAuthorization(endpoint, username, password, null)
    } catch (e) {
      this.emitError(e)
      return
    }

    if (response.kind === AuthorizationResponseKind.Authorized) {
      const token = response.token
      const user = await fetchUser(endpoint, token)
      this.emitAuthenticate(user)
      this.setState(null)
    } else if (response.kind === AuthorizationResponseKind.TwoFactorAuthenticationRequired) {
      this.setState({
        kind: Step.TwoFactorAuthentication,
        endpoint,
        username,
        password,
      })
    } else {
      this.setState({
        username,
        password,
        loading: false,
        response,
      })
    }
  }

  public authenticateWithBrowser() {

  }

  public beginEnterpriseSignIn() {
    this.setState({ kind: Step.EndpointEntry })
  }
}
