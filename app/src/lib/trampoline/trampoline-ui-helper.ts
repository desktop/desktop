import { PopupType } from '../../models/popup'
import { Dispatcher } from '../../ui/dispatcher'

type PromptSSHKeyPassphraseResponse = {
  readonly passphrase: string | undefined
  readonly storePassphrase: boolean
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
  ): Promise<PromptSSHKeyPassphraseResponse> {
    return new Promise(resolve => {
      this.dispatcher.showPopup({
        type: PopupType.SSHKeyPassphrase,
        keyPath,
        onSubmit: (passphrase, storePassphrase) =>
          resolve({ passphrase, storePassphrase }),
      })
    })
  }
}

export const trampolineUIHelper = new TrampolineUIHelper()
