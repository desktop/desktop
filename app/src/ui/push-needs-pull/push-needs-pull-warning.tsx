import * as React from 'react'
import { Dispatcher } from '../dispatcher'
import { ButtonGroup } from '../lib/button-group'
import { DialogFooter, DialogContent, Dialog } from '../dialog'
import { FetchType } from '../../models/fetch'
import { Button } from '../lib/button'
import { Repository } from '../../models/repository'

interface IPushNeedsPullWarningProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly onDismissed: () => void
}

export class PushNeedsPullWarning extends React.Component<
  IPushNeedsPullWarningProps,
  {}
> {
  public render() {
    return (
      <Dialog
        title={
          __DARWIN__ ? 'Newer Commits on Remote' : 'Newer commits on remote'
        }
        onDismissed={this.props.onDismissed}
        onSubmit={this.onFetch}
        type="warning"
      >
        <DialogContent>
          <p>
            Desktop is unable to push commits to this branch because there are
            new commits on the remote. We need to fetch and identify what needs
            to change.
          </p>
        </DialogContent>
        <DialogFooter>
          <ButtonGroup>
            <Button type="submit">Fetch</Button>
          </ButtonGroup>
        </DialogFooter>
      </Dialog>
    )
  }

  private onFetch = async () => {
    await this.props.dispatcher.fetch(
      this.props.repository,
      FetchType.UserInitiatedTask
    )
    this.props.onDismissed()
  }
}
