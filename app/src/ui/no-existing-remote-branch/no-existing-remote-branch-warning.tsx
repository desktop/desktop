import * as React from 'react'
import { Button } from '../lib/button'
import { ButtonGroup } from '../lib/button-group'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Dispatcher } from '../../ui/dispatcher'
import { Repository } from '../../models/repository'
import { Ref } from '../lib/ref'

interface INoExistingRemoteBranchWarningProps {
  readonly onDismissed: () => void
  readonly dispatcher: Dispatcher
  readonly branchName: string
  readonly repository: Repository
}

/** A dialog to display a list of files that would be overwritten by a checkout. */
export class NoExistingRemoteBranchWarning extends React.Component<
  INoExistingRemoteBranchWarningProps
> {
  private closeButton: Button | null = null

  public constructor(props: INoExistingRemoteBranchWarningProps) {
    super(props)
  }

  private onCloseButtonRef = (button: Button | null) => {
    this.closeButton = button
  }

  public componentDidMount() {
    // Since focus is given to the overwritten files by default, we will instead set focus onto the cancel button.
    if (this.closeButton != null) {
      this.closeButton.focus()
    }
  }

  public render() {
    return (
      <Dialog
        id="no-existing-remote-branch"
        title={
          __DARWIN__ ? 'No Existing Remote Branch' : 'No existing remote branch'
        }
        onDismissed={this.props.onDismissed}
        type="warning"
      >
        <DialogContent>
          <p>
            The branch <Ref>{this.props.branchName}</Ref> doesn't not exist on
            remote.
          </p>
        </DialogContent>

        <DialogFooter>
          <ButtonGroup destructive={true}>
            <Button type="submit" ref={this.onCloseButtonRef}>
              Cancel
            </Button>
            <Button onClick={this.publishBranch}>
              {__DARWIN__ ? 'Publish Branch' : 'Publish branch'}
            </Button>
          </ButtonGroup>
        </DialogFooter>
      </Dialog>
    )
  }

  private publishBranch = async () => {
    this.props.dispatcher.closePopup()

    await this.props.dispatcher.push(this.props.repository)
  }
}
