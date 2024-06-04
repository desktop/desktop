import { IGitAccount } from '../../models/git-account'
import { PopupType } from '../../models/popup'
import { Dispatcher } from '../../ui/dispatcher'

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
}

export const trampolineUIHelper = new TrampolineUIHelper()
