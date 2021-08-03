import { PopupType } from '../../models/popup'
import { Dispatcher } from '../../ui/dispatcher'

class TrampolineUIHelper {
  // The dispatcher must be set before this helper can do anything
  private dispatcher!: Dispatcher

  public setDispatcher(dispatcher: Dispatcher) {
    this.dispatcher = dispatcher
  }

  public promptAddingSSHHost(message: string): Promise<boolean> {
    return new Promise(resolve => {
      this.dispatcher.showPopup({
        type: PopupType.AddSSHHost,
        message,
        onSubmit: resolve,
      })
    })
  }
}

export const trampolineUIHelper = new TrampolineUIHelper()
