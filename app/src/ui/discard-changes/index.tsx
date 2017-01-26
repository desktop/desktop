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

/** A component to confirm and then discard changes. */
export class DiscardChanges extends React.Component<IDiscardChangesProps, void> {
  public render() {
    const paths = this.props.files.map(f => f.path).join(', ')
    const trashName = __DARWIN__ ? 'Trash' : 'Recycle Bin'
    return (
      <Form onSubmit={this.cancel}>
        <div>{ __DARWIN__ ? 'Confirm Discard Changes' : 'Confirm discard changes'}</div>
        <div>Are you sure you want to discard all changes to {paths}?</div>

        <div>Changes can be restored by retrieving them from the {trashName}.</div>

        <Button type='submit'>Cancel</Button>
        <Button onClick={this.discard}>{__DARWIN__ ? 'Discard Changes' : 'Discard changes'}</Button>
      </Form>
    )
  }

  private cancel = () => {
    this.props.dispatcher.closePopup()
  }

  private discard = () => {
    this.props.dispatcher.discardChanges(this.props.repository, this.props.files)
    this.props.dispatcher.closePopup()
  }
}
