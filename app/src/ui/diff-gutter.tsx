import * as React from 'react'
import { DiffLine, DiffLineType } from '../models/diff'

interface IDiffGutterProps {
  readonly line: DiffLine
  readonly onIncludeChanged: (line: DiffLine) => void
}

export default class DiffGutter extends React.Component<IDiffGutterProps, void> {
  private onMouseEnterHandler(target: HTMLElement) {
    if (this.props.line.type === DiffLineType.Add || this.props.line.type === DiffLineType.Delete) {
      target.classList.add('diff-line-hover')
    }
  }

  private onMouseLeaveHandler(target: HTMLElement) {
    if (this.props.line.type === DiffLineType.Add || this.props.line.type === DiffLineType.Delete) {
      target.classList.remove('diff-line-hover')
    }
  }

  private onMouseDownHandler() {
    this.props.onIncludeChanged(this.props.line)
  }

  public render() {
    const baseClassName = 'diff-line-column'
    const className = `${baseClassName} ${this.props.line.selected ? 'diff-line-selected' : ''}`

    // TODO: depending on cursor position, highlight hunk rather than line

    return (
      <div className={className}
        onMouseEnter={event => this.onMouseEnterHandler(event.currentTarget)}
        onMouseLeave={event => this.onMouseLeaveHandler(event.currentTarget)}
        onMouseDown={event => this.onMouseDownHandler()}>
        <div className='diff-line-number before'>{this.props.line.oldLineNumber}</div>
        <div className='diff-line-number after'>{this.props.line.newLineNumber}</div>
      </div>
    )
  }
}
