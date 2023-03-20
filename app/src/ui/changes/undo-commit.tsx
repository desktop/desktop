import * as React from 'react'

import { Commit } from '../../models/commit'
import { RichText } from '../lib/rich-text'
import { RelativeTime } from '../relative-time'
import { Button } from '../lib/button'

interface IUndoCommitProps {
  /** The function to call when the Undo button is clicked. */
  readonly onUndo: () => void

  /** The commit to undo. */
  readonly commit: Commit

  /** The emoji cache to use when rendering the commit message */
  readonly emoji: Map<string, string>

  /** whether a push, pull or fetch is in progress */
  readonly isPushPullFetchInProgress: boolean

  /** whether a committing is in progress */
  readonly isCommitting: boolean
}

/** The Undo Commit component. */
export class UndoCommit extends React.Component<IUndoCommitProps, {}> {
  private button: HTMLButtonElement | null = null

  public componentDidMount(): void {
    const diff = this.props.commit.author.date.getTime() - Date.now()
    const duration = Math.abs(diff)
    if (duration < 1000 && this.props.isCommitting === false) {
      this.focusButton()
    }
  }

  public focusButton = () => {
    this.button?.focus()
  }

  private onButtonRef = (button: HTMLButtonElement | null) => {
    this.button = button
  }

  public render() {
    const disabled =
      this.props.isPushPullFetchInProgress || this.props.isCommitting
    const title = disabled
      ? 'Undo is disabled while the repository is being updated'
      : undefined

    const authorDate = this.props.commit.author.date
    return (
      <div id="undo-commit">
        <div className="commit-info" id="commit-info">
          <div className="ago">
            Committed <RelativeTime date={authorDate} />
          </div>
          <RichText
            emoji={this.props.emoji}
            className="summary"
            text={this.props.commit.summary}
            renderUrlsAsLinks={false}
          />
          <span className="sr-only"> Undo </span>
        </div>
        <div className="actions" title={title}>
          <Button
            onButtonRef={this.onButtonRef}
            size="small"
            disabled={disabled}
            onClick={this.props.onUndo}
            ariaLabelledby="commit-info"
          >
            Undo
          </Button>
        </div>
      </div>
    )
  }
}
