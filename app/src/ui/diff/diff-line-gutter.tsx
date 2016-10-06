import * as React from 'react'
import { DiffLine, DiffLineType } from '../../models/diff'

/** The props for the diff gutter. */
interface IDiffGutterProps {
  /** The line being represented by the gutter. */
  readonly line: DiffLine

  readonly isIncluded: boolean

  /**
   * Is the gutter being used in a readonly diff, e.g., displaying a diff from
   * history vs. displaying a diff from the working directory.
   */
  readonly readOnly: boolean

  /** Called when the line's includedness is toggled. */
  readonly onIncludeChanged?: (line: DiffLine) => void
}

/** The gutter for a diff's line. */
export class DiffLineGutter extends React.Component<IDiffGutterProps, void> {
  /** Can this line be selected for inclusion/exclusion? */
  private isIncludableLine(): boolean {
    return this.props.line.type === DiffLineType.Add || this.props.line.type === DiffLineType.Delete
  }

  private onMouseEnter(target: HTMLElement) {
    if (this.isIncludableLine()) {
      target.classList.add('diff-line-hover')
    }
  }

  private onMouseLeave(target: HTMLElement) {
    if (this.isIncludableLine()) {
      target.classList.remove('diff-line-hover')
    }
  }

  private onClick() {
    if (this.props.onIncludeChanged && this.isIncludableLine()) {
      this.props.onIncludeChanged(this.props.line)
    }
  }

  public render() {
    const baseClassName = 'diff-line-gutter'
    const selectedStateClassName = (this.isIncludableLine() && this.props.isIncluded) ? 'diff-line-selected' : ''
    const className = `${baseClassName} ${selectedStateClassName}`

    // TODO: depending on cursor position, highlight hunk rather than line

    const mouseEnter = this.props.readOnly ?
      undefined :
      (event: React.MouseEvent<HTMLDivElement>) => this.onMouseEnter(event.currentTarget)

    const mouseLeave = this.props.readOnly ?
      undefined :
      (event: React.MouseEvent<HTMLDivElement>) => this.onMouseLeave(event.currentTarget)

    const onClick = this.props.readOnly ?
      undefined :
      (event: React.MouseEvent<HTMLDivElement>) => this.onClick()

    return (
      <span className={className}
        onMouseEnter={mouseEnter}
        onMouseLeave={mouseLeave}
        onClick={onClick}>
        <span className='diff-line-number before'>{this.props.line.oldLineNumber || ' '}</span>
        <span className='diff-line-number after'>{this.props.line.newLineNumber || ' '}</span>
      </span>
    )
  }
}
