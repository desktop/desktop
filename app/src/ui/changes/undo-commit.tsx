import * as React from 'react'

import { Commit } from '../../lib/local-git-operations'
import { EmojiText } from '../lib/emoji-text'
import { RelativeTime } from '../relative-time'

interface IUndoCommitProps {
  /** The function to call when the Undo button is clicked. */
  readonly onUndo: () => void

  /** The commit to undo. */
  readonly commit: Commit

  readonly emoji: Map<string, string>
}

/** The Undo Commit component. */
export class UndoCommit extends React.Component<IUndoCommitProps, void> {
  public render() {
    const authorDate = this.props.commit.authorDate
    return (
      <div id='undo-commit'>
        <div className='commit-info'>
          <div className='ago'>Committed <RelativeTime date={authorDate} /></div>
          <EmojiText emoji={this.props.emoji} className='summary'>{this.props.commit.summary}</EmojiText>
        </div>
        <div className='actions'>
          <button className='button' onClick={() => this.props.onUndo()}>Undo</button>
        </div>
      </div>
    )
  }
}
