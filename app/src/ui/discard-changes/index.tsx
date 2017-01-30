import * as React from 'react'

import { Repository } from '../../models/repository'
import { Dispatcher } from '../../lib/dispatcher'
import { WorkingDirectoryFileChange } from '../../models/status'
import { Form } from '../lib/form'
import { Button } from '../lib/button'

interface IDiscardChangesProps {
  readonly repository: Repository
  readonly dispatcher: Dispatcher
  readonly files: ReadonlyArray<WorkingDirectoryFileChange>
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
      <Form className='discard-changes' onSubmit={this.cancel}>
        <div>{ __DARWIN__ ? 'Confirm Discard Changes' : 'Confirm discard changes'}</div>
        <div>
          {this.renderFileList()}

          <div>Changes can be restored by retrieving them from the {trashName}.</div>
        </div>

        <Button type='submit'>Cancel</Button>
        <Button onClick={this.discard}>{__DARWIN__ ? 'Discard Changes' : 'Discard changes'}</Button>
      </Form>
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

  private cancel = () => {
    this.props.dispatcher.closePopup()
  }

  private discard = () => {
    this.props.dispatcher.discardChanges(this.props.repository, this.props.files)
    this.props.dispatcher.closePopup()
  }
}
