import * as React from 'react'
import { Button } from '../lib/button'
import { ButtonGroup } from '../lib/button-group'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Dispatcher } from '../../lib/dispatcher'
import { RepositorySectionTab, PopupType } from '../../lib/app-state'
import { Repository } from '../../models/repository'
import { abortMerge } from '../../lib/git'
import { Octicon, OcticonSymbol } from '../octicons'

interface IAbortMergeWarningProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly onDismissed: () => void
}

const titleString = __DARWIN__ ? 'Confirm Abort Merge' : 'Confirm abort merge'
const cancelButtonString = 'Cancel'
const abortButtonString = __DARWIN__ ? 'Abort Merge' : 'Abort merge'

/**
 * Modal to tell the user their merge encountered conflicts
 */
export class AbortMergeWarning extends React.Component<
  IAbortMergeWarningProps,
  {}
> {
  /**
   *  aborte the merge and dismisses the modal
   */
  private onSubmit = async () => {
    await abortMerge(this.props.repository)
    this.props.onDismissed()
    this.props.dispatcher.changeRepositorySection(
      this.props.repository,
      RepositorySectionTab.Changes
    )
  }

  /**
   *  dismisses the modal and shows the merge conflicts modal
   */
  private onCancel = () => {
    this.props.onDismissed()
    this.props.dispatcher.showPopup({
      type: PopupType.MergeConflicts,
      repository: this.props.repository,
    })
  }

  public render() {
    return (
      <Dialog
        id="abort-merge-warning"
        title={titleString}
        dismissable={false}
        onDismissed={this.onCancel}
        onSubmit={this.onSubmit}
      >
        <DialogContent className="content-wrapper">
          <Octicon symbol={OcticonSymbol.alert} />
          <div className="column-left">
            <p>Are you sure you want to abort merging?</p>
            <p>
              Aborting this merge will take you back to the pre-merge state and
              the conflicts you've already resolved will still be present.
            </p>
          </div>
        </DialogContent>
        <DialogFooter>
          <ButtonGroup>
            <Button type="submit">{abortButtonString}</Button>
            <Button onClick={this.onCancel}>{cancelButtonString}</Button>
          </ButtonGroup>
        </DialogFooter>
      </Dialog>
    )
  }
}
