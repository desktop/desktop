import * as React from 'react'
import { Dispatcher } from '../dispatcher'
import { ButtonGroup } from '../lib/button-group'
import { DialogFooter, DialogContent, Dialog } from '../dialog'
import { FetchType } from '../../models/fetch'
import { Button } from '../lib/button'
import { Repository } from '../../models/repository'
import { Loading } from '../lib/loading'

interface IPushNeedsPullWarningProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly onDismissed: () => void
}

interface IPushNeedsPullWarningState {
  readonly isLoading: boolean
}

export class PushNeedsPullWarning extends React.Component<
  IPushNeedsPullWarningProps,
  IPushNeedsPullWarningState
> {
  public constructor(props: IPushNeedsPullWarningProps) {
    super(props)

    this.state = {
      isLoading: false,
    }
  }

  public render() {
    return (
      <Dialog
        title={
          __DARWIN__ ? 'Newer Commits on Remote' : 'Newer commits on remote'
        }
        dismissable={!this.state.isLoading}
        onDismissed={this.props.onDismissed}
        onSubmit={this.onFetch}
        type="warning"
      >
        <DialogContent>
          <p>
            Desktop is unable to push commits to this branch because there are
            commits on the remote that are not present on your local branch.
            Fetch these new commits before pushing in order to reconcile them
            with your local commits.
          </p>
        </DialogContent>
        <DialogFooter>
          <ButtonGroup>
            <Button type="submit" disabled={this.state.isLoading}>
              {this.state.isLoading ? <Loading /> : null} Fetch
            </Button>
          </ButtonGroup>
        </DialogFooter>
      </Dialog>
    )
  }

  private onFetch = async () => {
    this.setState({ isLoading: true })
    await this.props.dispatcher.fetch(
      this.props.repository,
      FetchType.UserInitiatedTask
    )
    this.setState({ isLoading: false })
    this.props.onDismissed()
  }
}
