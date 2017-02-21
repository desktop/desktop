import { Emitter, Disposable } from 'event-kit'
import { User } from '../../models/user'
import { assertNever, fatalError } from '../fatal-error'
import { askUserToOAuth } from '../../lib/oauth'
import { validateURL, InvalidURLErrorName, InvalidProtocolErrorName } from '../../ui/lib/enterprise-validate-url'

import {
  createAuthorization,
  AuthorizationResponse,
  fetchUser,
  AuthorizationResponseKind,
  getDotComAPIEndpoint,
  getEnterpriseAPIURL,
  fetchMetadata,
} from '../../lib/api'

export enum SignInStep {
  EndpointEntry,
  Authentication,
  TwoFactorAuthentication,
  Success,
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

export type SignInState = IEndpointEntryState | IAuthenticationState | ITwoFactorAuthenticationState | ISuccessState

export interface ISignInState {
  readonly kind: SignInStep
  readonly error: Error | null,
  readonly loading: boolean,
}

export interface IEndpointEntryState extends ISignInState {
  readonly kind: SignInStep.EndpointEntry
}

export interface IAuthenticationState extends ISignInState {
  readonly kind: SignInStep.Authentication
  readonly endpoint: string,
  readonly authMethods: Set<AuthenticationMethods>
}

export interface ITwoFactorAuthenticationState extends ISignInState {
  readonly kind: SignInStep.TwoFactorAuthentication
  readonly endpoint: string,
  readonly username: string,
  readonly password: string
}

export interface ISuccessState {
  readonly kind: SignInStep.Success
}

export class SignInStore {
  private readonly emitter = new Emitter()
  private state: SignInState | null = null

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
  public onDidAuthenticate(fn: (user: User) => void): Disposable {
    return this.emitter.on('did-authenticate', fn)
  }

  /** Register a function to be called when an error occurs. */
  public onDidError(fn: (error: Error) => void): Disposable {
    return this.emitter.on('did-error', fn)
  }

  public getState(): SignInState | null {
    return this.state
  }

  private setState(state: SignInState | null) {
    this.state = state
    this.emitUpdate()
  }

  private async fetchAllowedAuthenticationMethods(endpoint: string): Promise<Set<AuthenticationMethods>> {
    const response = await fetchMetadata(endpoint)

    if (response) {
      const authMethods = new Set([
        AuthenticationMethods.BasicAuth,
        AuthenticationMethods.OAuth,
      ])

      if (response.verifiable_password_authentication === false) {
        authMethods.delete(AuthenticationMethods.BasicAuth)
      }

      return authMethods
    } else {
      throw new Error('Unsupported Enterprise server')
    }
  }

  public reset() {
    this.setState(null)
  }

  public beginDotComSignIn() {
    this.setState({
      kind: SignInStep.Authentication,
      endpoint: getDotComAPIEndpoint(),
      authMethods: DefaultAuthMethods,
      error: null,
      loading: false,
    })
  }

  public async authenticateWithBasicAuth(username: string, password: string): Promise<void> {
    const currentState = this.state

    if (!currentState || currentState.kind !== SignInStep.Authentication) {
      const stepText = currentState ? currentState.kind : 'null'
      return fatalError(`Sign in step '${stepText}' not compatible with authentication`)
    }

    const endpoint = currentState.endpoint

    this.setState({ ...currentState, loading: true })

    let response: AuthorizationResponse
    try {
      response = await createAuthorization(endpoint, username, password, null)
    } catch (e) {
      this.emitError(e)
      return
    }

    if (!this.state || this.state.kind !== SignInStep.Authentication) {
      // Looks like the sign in flow has been aborted
      return
    }

    if (response.kind === AuthorizationResponseKind.Authorized) {
      const token = response.token
      const user = await fetchUser(endpoint, token)

      if (!this.state || this.state.kind !== SignInStep.Authentication) {
        // Looks like the sign in flow has been aborted
        return
      }

      this.emitAuthenticate(user)
      this.setState({ kind: SignInStep.Success })
    } else if (response.kind === AuthorizationResponseKind.TwoFactorAuthenticationRequired) {
      this.setState({
        kind: SignInStep.TwoFactorAuthentication,
        endpoint,
        username,
        password,
        error: null,
        loading: false,
      })
    } else {
      if (response.kind === AuthorizationResponseKind.Error) {
        if (response.response.error) {
          this.emitError(response.response.error)
        } else {
          this.emitError(new Error(`The server responded with an error (${response.response.statusCode})\n\n${response.response.body}`))
        }
        this.setState({ ...currentState, loading: false })
      } else if (response.kind === AuthorizationResponseKind.Failed) {
        this.setState({
          ...currentState,
          loading: false,
          error: new Error('Incorrect username or password.'),
        })
      } else {
        return assertNever(response, `Unsupported response: ${response}`)
      }
    }
  }

  public async authenticateWithBrowser(): Promise<void> {
    const currentState = this.state

    if (!currentState || currentState.kind !== SignInStep.Authentication) {
      const stepText = currentState ? currentState.kind : 'null'
      return fatalError(`Sign in step '${stepText}' not compatible with browser authentication`)
    }

    this.setState({ ...currentState, loading: true })

    let user: User
    try {
      user = await askUserToOAuth(currentState.endpoint)
    } catch (e) {
      this.setState({ ...currentState, error: e, loading: false })
      return
    }

    if (!this.state || this.state.kind !== SignInStep.Authentication) {
      // Looks like the sign in flow has been aborted
      return
    }

    this.emitAuthenticate(user)
    this.setState({ kind: SignInStep.Success })
  }

  public beginEnterpriseSignIn() {
    this.setState({ kind: SignInStep.EndpointEntry, error: null, loading: false })
  }

  public async setEndpoint(url: string): Promise<void> {
    const currentState = this.state

    if (!currentState || currentState.kind !== SignInStep.EndpointEntry) {
      const stepText = currentState ? currentState.kind : 'null'
      return fatalError(`Sign in step '${stepText}' not compatible with endpoint entry`)
    }

    this.setState({ ...currentState, loading: true })

    let validUrl: string
    try {
      validUrl = validateURL(url)
    } catch (e) {
      let error = e
      if (e.name === InvalidURLErrorName) {
        error = new Error(`The Enterprise server address doesn't appear to be a valid URL. We're expecting something like https://github.example.com.`)
      } else if (e.name === InvalidProtocolErrorName) {
        error = new Error('Unsupported protocol. We can only sign in to GitHub Enterprise instances over http or https.')
      }

      this.setState({ ...currentState, loading: false, error })
      return
    }

    const endpoint = getEnterpriseAPIURL(validUrl)
    try {
      const authMethods = await this.fetchAllowedAuthenticationMethods(endpoint)

      if (!this.state || this.state.kind !== SignInStep.EndpointEntry) {
        // Looks like the sign in flow has been aborted
        return
      }

      this.setState({
        kind: SignInStep.Authentication,
        endpoint,
        authMethods,
        error: null,
        loading: false,
      })
    } catch (e) {
      let error = e
      // We'll get an ENOTFOUND if the address couldn't be resolved.
      if (e.code === 'ENOTFOUND') {
        error = new Error('The server could not be found')
      }

      this.setState({ ...currentState, loading: false, error })
    }
  }

  public async setTwoFactorOTP(otp: string) {

    const currentState = this.state

    if (!currentState || currentState.kind !== SignInStep.TwoFactorAuthentication) {
      const stepText = currentState ? currentState.kind : 'null'
      return fatalError(`Sign in step '${stepText}' not compatible with two factor authentication`)
    }

    this.setState({ ...currentState, loading: true })

    let response: AuthorizationResponse

    try {
      response = await createAuthorization(
        currentState.endpoint,
        currentState.username,
        currentState.password,
        otp
      )
    } catch (e) {
      this.emitError(e)
      return
    }

    if (!this.state || this.state.kind !== SignInStep.TwoFactorAuthentication) {
      // Looks like the sign in flow has been aborted
      return
    }

    if (response.kind === AuthorizationResponseKind.Authorized) {
      const token = response.token
      const user = await fetchUser(currentState.endpoint, token)

      if (!this.state || this.state.kind !== SignInStep.TwoFactorAuthentication) {
        // Looks like the sign in flow has been aborted
        return
      }

      this.emitAuthenticate(user)
      this.setState({ kind: SignInStep.Success })
    } else {
      switch (response.kind) {
        case AuthorizationResponseKind.Failed:
        case AuthorizationResponseKind.TwoFactorAuthenticationRequired:
          this.setState({
            ...currentState,
            loading: false,
            error: new Error('Two-factor authentication failed.'),
          })
          break
        case AuthorizationResponseKind.Error:
          const error = response.response.error
          if (error) {
            this.emitError(error)
          } else {
            this.emitError(new Error(`The server responded with an error (${response.response.statusCode})\n\n${response.response.body}`))
          }
          break
        default:
          return assertNever(response, `Unknown response: ${response}`)
      }
    }
  }
}
