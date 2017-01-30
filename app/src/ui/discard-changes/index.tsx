import * as React from 'react'

import { Repository } from '../../models/repository'
import { Dispatcher } from '../../lib/dispatcher'
import { WorkingDirectoryFileChange } from '../../models/status'
import { Form } from '../lib/form'
import { Button } from '../lib/button'
import { ButtonGroup } from '../lib/button-group'
import { Dialog, DialogContent, DialogFooter } from '../dialog'

interface IDiscardChangesProps {
  readonly repository: Repository
  readonly dispatcher: Dispatcher
  readonly files: ReadonlyArray<WorkingDirectoryFileChange>
  readonly onDismissed: () => void
}

/**
 * If we're discarding any more than this number, we won't bother listing them
 * all.
 */
const MaxFilesToList = 10

/** A component to confirm and then discard changes. */
export class DiscardChanges extends React.Component<IDiscardChangesProps, void> {
  public render() {
    const trashName = __DARWIN__ ? 'Trash' : 'Recycle Bin'
    return (
      <Dialog
        title={ __DARWIN__ ? 'Confirm Discard Changes' : 'Confirm discard changes'}
        onDismissed={this.props.onDismissed}
        type='warning'
      >
        <Form className='discard-changes' onSubmit={this.props.onDismissed}>
          <DialogContent>
            <div>
              {this.renderFileList()}

              <div>Changes can be restored by retrieving them from the {trashName}.</div>
            </div>
          </DialogContent>

          <DialogFooter>
            <ButtonGroup>
              <Button type='submit'>Cancel</Button>
              <Button onClick={this.discard}>{__DARWIN__ ? 'Discard Changes' : 'Discard changes'}</Button>
            </ButtonGroup>
          </DialogFooter>
        </Form>
      </Dialog>
    )
  }

  private renderFileList() {
    if (this.props.files.length > MaxFilesToList) {
      return (
        <div>
          Are you sure you want to discard all changes?
          <div>&nbsp;</div>
        </div>
      )
    } else {
      return (
        <div>Are you sure you want to discard all changes to:
          <ul>
            {this.props.files.map(p =>
              <li className='file-name' key={p.id}>{p.path}</li>
            )}
          </ul>
        </div>
      )
    }
  }

  private discard = () => {
    this.props.dispatcher.discardChanges(this.props.repository, this.props.files)
    this.props.dispatcher.closePopup()
  }
}
