import * as React from 'react'
import * as moment from 'moment'

import { Commit } from '../../lib/local-git-operations'
import { EmojiText } from '../lib/emoji-text'

interface IUndoCommit {
  /** The function to call when the Undo button is clicked. */
  readonly onUndo: () => void

  /** The commit to undo. */
  readonly commit: Commit

  readonly emoji: Map<string, string>
}

/** The Undo Commit component. */
export class UndoCommit extends React.Component<IUndoCommit, void> {
  public render() {
    const relative = moment(this.props.commit.authorDate).fromNow()
    return (
      <div id='undo-commit'>
        <div className='commit-info'>
          <div className='ago'>Committed {relative}</div>
          <EmojiText emoji={this.props.emoji} className='summary'>{this.props.commit.summary}</EmojiText>
        </div>
        <button onClick={() => this.props.onUndo()}>Undo</button>
      </div>
    )
  }
}
