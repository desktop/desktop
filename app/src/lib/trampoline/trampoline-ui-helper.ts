import { Dispatcher } from '../../ui/dispatcher'

enum AddSSHHostPreference {
  YES = 'yes',
  NO = 'no',
  PERMANENT = 'permanent',
}

class TrampolineUIHelper {
  // The dispatcher must be set before this helper can do anything
  private dispatcher!: Dispatcher

  public setDispatcher(dispatcher: Dispatcher) {
    this.dispatcher = dispatcher
  }

  public promptAddingSSHHost(message: string): Promise<AddSSHHostPreference> {
    return new Promise((resolve, reject) => {
      this.dispatcher.showPopup({
        type: 'input',
        title: 'Add SSH Host',
        message,
        input: '',
      })
    })
  }
}

export const trampolineUIHelper = new TrampolineUIHelper()
