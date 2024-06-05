import { Account } from '../../models/account'
import { IGitAccount } from '../../models/git-account'
import { PopupType } from '../../models/popup'
import { Dispatcher } from '../../ui/dispatcher'
import { SignInResult } from '../stores'

type PromptSSHSecretResponse = {
  readonly secret: string | undefined
  readonly storeSecret: boolean
}

class TrampolineUIHelper {
  // The dispatcher must be set before this helper can do anything
  private dispatcher!: Dispatcher

  public setDispatcher(dispatcher: Dispatcher) {
    this.dispatcher = dispatcher
  }

  public promptAddingSSHHost(
    host: string,
    ip: string,
    keyType: string,
    fingerprint: string
  ): Promise<boolean> {
    return new Promise(resolve => {
      this.dispatcher.showPopup({
        type: PopupType.AddSSHHost,
        host,
        ip,
        keyType,
        fingerprint,
        onSubmit: addHost => resolve(addHost),
      })
    })
  }

  public promptSSHKeyPassphrase(
    keyPath: string
  ): Promise<PromptSSHSecretResponse> {
    return new Promise(resolve => {
      this.dispatcher.showPopup({
        type: PopupType.SSHKeyPassphrase,
        keyPath,
        onSubmit: (passphrase, storePassphrase) =>
          resolve({ secret: passphrase, storeSecret: storePassphrase }),
      })
    })
  }

  public promptSSHUserPassword(
    username: string
  ): Promise<PromptSSHSecretResponse> {
    return new Promise(resolve => {
      this.dispatcher.showPopup({
        type: PopupType.SSHUserPassword,
        username,
        onSubmit: (password, storePassword) =>
          resolve({ secret: password, storeSecret: storePassword }),
      })
    })
  }

  public promptForGenericGitAuthentication(
    endpoint: string,
    username?: string
  ): Promise<IGitAccount | undefined> {
    return new Promise(resolve => {
      this.dispatcher.showPopup({
        type: PopupType.GenericGitAuthentication,
        remoteUrl: endpoint,
        username,
        onSubmit: (login: string, token: string) =>
          resolve({ login, token, endpoint }),
        onDismiss: () => resolve(undefined),
      })
    })
  }

  public promptForGitHubSignIn(endpoint: string): Promise<Account | undefined> {
    return new Promise<Account | undefined>(async resolve => {
      const cb = (result: SignInResult) => {
        resolve(result.kind === 'success' ? result.account : undefined)
        this.dispatcher.closePopup(PopupType.SignIn)
      }

      const { hostname, origin } = new URL(endpoint)
      if (hostname === 'github.com') {
        this.dispatcher.beginDotComSignIn(cb)
      } else {
        this.dispatcher.beginEnterpriseSignIn(cb)
        await this.dispatcher.setSignInEndpoint(origin)
      }

      this.dispatcher.showPopup({
        type: PopupType.SignIn,
        isCredentialHelperSignIn: true,
        credentialHelperUrl: endpoint,
      })
    }).catch(e => {
      log.error(`Could not prompt for GitHub sign in`, e)
      return undefined
    })
  }
}

export const trampolineUIHelper = new TrampolineUIHelper()
