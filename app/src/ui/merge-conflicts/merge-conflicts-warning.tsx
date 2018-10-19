import * as React from 'react'
import { Button } from '../lib/button'
import { ButtonGroup } from '../lib/button-group'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Dispatcher } from '../../lib/dispatcher'
import { RepositorySectionTab } from '../../lib/app-state'
import { Repository } from '../../models/repository'

interface IMergeConflictsWarningProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly onDismissed: () => void
}

/**
 * Modal to tell the user their merge encountered conflicts
 */
export class MergeConflictsWarning extends React.Component<
  IMergeConflictsWarningProps,
  {}
> {
  /**
   *  displays the repository changes tab and dismisses the modal
   */
  private onSubmit = () => {
    this.props.dispatcher.changeRepositorySection(
      this.props.repository,
      RepositorySectionTab.Changes
    )
    this.props.onDismissed()
  }

  public render() {
    return (
      <Dialog
        id="merge-conflicts-warning"
        title={__DARWIN__ ? 'Merge Conflicts Found' : 'Merge conflicts found'}
        onDismissed={this.props.onDismissed}
        onSubmit={this.onSubmit}
      >
        <DialogContent>
          <p>Conflicts were detected as part of the last merge operation.</p>
          <p>
            You will need to view and resolve these conflicts via your editor or
            shell before finishing and creating the merge commit.
          </p>
        </DialogContent>

        <DialogFooter>
          <ButtonGroup>
            <Button type="submit">
              {__DARWIN__ ? 'View Conflicts' : 'View conflicts'}
            </Button>
            <Button onClick={this.props.onDismissed}>Close</Button>
          </ButtonGroup>
        </DialogFooter>
      </Dialog>
    )
  }
}
