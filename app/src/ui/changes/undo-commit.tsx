import * as React from 'react'
import * as moment from 'moment'

import { Commit } from '../../lib/local-git-operations'

interface IUndoCommit {
  /** The function to call when the Undo button is clicked. */
  readonly onUndo: () => void

  /** The commit to undo. */
  readonly commit: Commit
}

/** The Undo Commit component. */
export class UndoCommit extends React.Component<IUndoCommit, void> {
  public render() {
    const relative = moment(this.props.commit.authorDate).fromNow()
    return (
      <div id='undo-commit'>
        <div className='commit-info'>
          <div className='ago'>Committed {relative}</div>
          <div className='summary'>{this.props.commit.summary}</div>
        </div>
        <button onClick={() => this.props.onUndo()}>Undo</button>
      </div>
    )
  }
}
