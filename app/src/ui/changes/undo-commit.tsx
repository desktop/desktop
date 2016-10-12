import * as React from 'react'

import { Commit } from '../../lib/local-git-operations'

interface IUndoCommit {
  readonly onUndo: () => void
  readonly commit: Commit
}

export class UndoCommit extends React.Component<IUndoCommit, void> {
  public render() {
    return (
      <div id='undo-commit'>
        <div className='commit-info'>
          <div className='ago'>Committed some time ago</div>
          <div className='summary'>{this.props.commit.summary}</div>
        </div>
        <button onClick={() => this.props.onUndo()}>Undo</button>
      </div>
    )
  }
}
