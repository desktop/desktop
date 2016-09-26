import * as React from 'react'

import { Repository } from '../../models/repository'
import { Dispatcher } from '../../lib/dispatcher'
import { WorkingDirectoryFileChange } from '../../models/status'

interface IDiscardChangesProps {
  readonly repository: Repository
  readonly dispatcher: Dispatcher
  readonly files: ReadonlyArray<WorkingDirectoryFileChange>
}

/** A component to confirm and then discard changes. */
export class DiscardChanges extends React.Component<IDiscardChangesProps, void> {
  public render() {
    const paths = this.props.files.map(f => f.path).join(', ')
    return (
      <form className='panel' onSubmit={e => this.cancel(e)}>
        <div>Confirm Discard Changes</div>
        <div>Are you sure you want to discard all changes to {paths}?</div>

        <button type='submit'>Cancel</button>
        <button onClick={() => this.discard()}>Discard Changes</button>
      </form>
    )
  }

  private cancel(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    this.props.dispatcher.closePopup()
  }

  private discard() {
    this.props.dispatcher.discardChanges(this.props.repository, this.props.files)
  }
}
