import * as React from 'react'
import { Button } from '../lib/button'
import { Dispatcher } from '../../lib/dispatcher'
import { updateStore } from '../lib/update-store'
import { ButtonGroup } from '../lib/button-group'
import { Dialog, DialogContent, DialogFooter } from '../dialog'

interface IUpdateAvailableProps {
  readonly dispatcher: Dispatcher
}

/**
 * A component which tells the user an update is available and gives them the
 * option of moving into the future or being a luddite.
 */
export class UpdateAvailable extends React.Component<IUpdateAvailableProps, void> {
  public render() {
    return (
      <Dialog
        id='update-available'
        title={__DARWIN__ ? 'Update Available' : 'Update available'}
        onSubmit={this.updateNow}
        onDismissed={this.dismiss}
      >
        <DialogContent>
          GitHub Desktop will be updated after it restarts!
        </DialogContent>

        <DialogFooter>
          <ButtonGroup>
            <Button type='submit'>{__DARWIN__ ? 'Update Now' : 'Update now'}</Button>
            <Button onClick={this.dismiss}>Cancel</Button>
          </ButtonGroup>
        </DialogFooter>
      </Dialog>
    )
  }

  private updateNow = () => {
    updateStore.quitAndInstallUpdate()
  }

  private dismiss = () => {
    this.props.dispatcher.closePopup()
  }
}
