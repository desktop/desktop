import { getDotComAPIEndpoint, getHTMLURL, IAPIEmail } from '../lib/api'

/**
 * Returns a value indicating whether two account instances
 * can be considered equal. Equality is determined by comparing
 * the two instances' endpoints and user id. This allows
 * us to keep receiving updated Account details from the API
 * while still maintaining the association between repositories
 * and a particular account.
 */
export function accountEquals(x: Account, y: Account) {
  return x.endpoint === y.endpoint && x.id === y.id
}

/**
 * A GitHub account, representing the user found on GitHub The Website or GitHub Enterprise.
 *
 * This contains a token that will be used for operations that require authentication.
 */
export class Account {
  /** Create an account which can be used to perform unauthenticated API actions */
  public static anonymous(): Account {
    return new Account('', getDotComAPIEndpoint(), '', [], '', -1, '', 'free')
  }

  private _friendlyEndpoint: string | undefined = undefined

  /**
   * Create an instance of an account
   *
   * @param login The login name for this account
   * @param endpoint The server for this account - GitHub or a GitHub Enterprise instance
   * @param token The access token used to perform operations on behalf of this account
   * @param emails The current list of email addresses associated with the account
   * @param avatarURL The profile URL to render for this account
   * @param id The GitHub.com or GitHub Enterprise database id for this account.
   * @param name The friendly name associated with this account
   * @param plan The plan associated with this account
   * @param copilotEndpoint The endpoint for the Copilot API
   * @param isCopilotDesktopEnabled Whether Copilot for Desktop is enabled for this account
   * @param features The Desktop-specific features available to this account
   * @param copilotLicenseType The user's Copilot license type
   */
  public constructor(
    public readonly login: string,
    public readonly endpoint: string,
    public readonly token: string,
    public readonly emails: ReadonlyArray<IAPIEmail>,
    public readonly avatarURL: string,
    public readonly id: number,
    public readonly name: string,
    public readonly plan?: string,
    public readonly copilotEndpoint?: string,
    public readonly isCopilotDesktopEnabled?: boolean,
    public readonly features?: ReadonlyArray<string>,
    public readonly copilotLicenseType?: string
  ) {}

  public withToken(token: string): Account {
    return new Account(
      this.login,
      this.endpoint,
      token,
      this.emails,
      this.avatarURL,
      this.id,
      this.name,
      this.plan,
      this.copilotEndpoint,
      this.isCopilotDesktopEnabled,
      this.features,
      this.copilotLicenseType
    )
  }

  /**
   * Get a name to display
   *
   * This will by default return the 'name' as it is the friendly name.
   * However, if not defined, we return the login
   */
  public get friendlyName(): string {
    return this.name !== '' ? this.name : this.login
  }

  /**
   * Get a human-friendly description of the Account endpoint.
   *
   * Accounts on GitHub.com will return the string 'GitHub.com'
   * whereas GitHub Enterprise accounts will return the
   * hostname without the protocol and/or path.
   */
  public get friendlyEndpoint(): string {
    return (this._friendlyEndpoint ??= isDotComAccount(this)
      ? 'GitHub.com'
      : new URL(getHTMLURL(this.endpoint)).hostname)
  }
}

/**
 * Whether or not the given account is a GitHub.com account as opposed to
 * a GitHub Enteprise account.
 */
export const isDotComAccount = (account: Account) =>
  account.endpoint === getDotComAPIEndpoint()

/**
 * Whether or not the given account is a GitHub Enterprise account (as opposed to
 * a GitHub.com account)
 */
export const isEnterpriseAccount = (account: Account) =>
  !isDotComAccount(account)
