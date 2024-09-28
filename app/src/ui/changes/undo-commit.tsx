import * as React from 'react'

import { Commit } from '../../models/commit'
import { RichText } from '../lib/rich-text'
import { RelativeTime } from '../relative-time'
import { Button } from '../lib/button'
import { Emoji } from '../../lib/emoji'

interface IUndoCommitProps {
  /** The function to call when the Undo button is clicked. */
  readonly onUndo: () => void

  /** The commit to undo. */
  readonly commit: Commit

  /** The emoji cache to use when rendering the commit message */
  readonly emoji: Map<string, Emoji>

  /** whether a push, pull or fetch is in progress */
  readonly isPushPullFetchInProgress: boolean

  /** whether a committing is in progress */
  readonly isCommitting: boolean
}

/** The Undo Commit component. */
export class UndoCommit extends React.Component<IUndoCommitProps, {}> {
  public render() {
    const disabled =
      this.props.isPushPullFetchInProgress || this.props.isCommitting
    const title = disabled
      ? 'Undo is disabled while the repository is being updated'
      : undefined

    const authorDate = this.props.commit.author.date
    return (
      <div id="undo-commit" role="group" aria-label="Undo commit">
        <div className="commit-info">
          <div className="ago">
            Committed <RelativeTime date={authorDate} />
          </div>
          <RichText
            emoji={this.props.emoji}
            className="summary"
            text={this.props.commit.summary}
            renderUrlsAsLinks={false}
          />
        </div>
        <div className="actions">
          <Button
            size="small"
            disabled={disabled}
            onClick={this.props.onUndo}
            tooltip={title}
          >
            Undo
          </Button>
        </div>
      </div>
    )
  }
}
