import * as React from 'react'
import { DiffLine, DiffLineType } from '../../models/diff'

interface IDiffGutterProps {
  readonly line: DiffLine
  readonly readOnly: boolean
  readonly onIncludeChanged?: (line: DiffLine) => void
}

/** The gutter for a diff's line. */
export default class DiffLineGutter extends React.Component<IDiffGutterProps, void> {
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
    if (this.props.onIncludeChanged) {
      this.props.onIncludeChanged(this.props.line)
    }
  }

  public render() {
    const baseClassName = 'diff-line-column'
    const className = `${baseClassName} ${this.props.line.selected ? 'diff-line-selected' : ''}`

    // TODO: depending on cursor position, highlight hunk rather than line

    const mouseEnter = this.props.readOnly ?
      undefined :
      (event: React.MouseEvent<HTMLDivElement>) => this.onMouseEnterHandler(event.currentTarget)

    const mouseLeave = this.props.readOnly ?
      undefined :
      (event: React.MouseEvent<HTMLDivElement>) => this.onMouseLeaveHandler(event.currentTarget)

    const mouseDown = this.props.readOnly ?
      undefined :
      (event: React.MouseEvent<HTMLDivElement>) => this.onMouseDownHandler()

    return (
      <span className={className}
        onMouseEnter={mouseEnter}
        onMouseLeave={mouseLeave}
        onMouseDown={mouseDown}>
        <span className='diff-line-number before'>{this.props.line.oldLineNumber}</span>
        <span className='diff-line-number after'>{this.props.line.newLineNumber}</span>
      </span>
    )
  }
}
