import * as React from 'react'
import { DiffLine, DiffLineType } from '../../models/diff'
import { assertNever } from '../../lib/fatal-error'

/** The props for the diff gutter. */
interface IDiffGutterProps {
  /** The line being represented by the gutter. */
  readonly line: DiffLine

  /**
   * In the case of a non-readonly line, indicates whether the given line
   * should be rendered as selected or not.
   */
  readonly isIncluded: boolean

  /**
   * Is the gutter being used in a readonly diff, e.g., displaying a diff from
   * history vs. displaying a diff from the working directory.
   */
  readonly readOnly: boolean
}

/** The gutter for a diff's line. */
export class DiffLineGutter extends React.Component<IDiffGutterProps, void> {
  /** Can this line be selected for inclusion/exclusion? */
  private isIncludableLine(): boolean {
    return this.props.line.type === DiffLineType.Add || this.props.line.type === DiffLineType.Delete
  }

  private getLineClassName(): string {
    const type = this.props.line.type
    switch (type) {
      case DiffLineType.Add: return 'diff-add'
      case DiffLineType.Delete: return 'diff-delete'
      case DiffLineType.Context: return 'diff-context'
      case DiffLineType.Hunk: return 'diff-hunk'
    }

    return assertNever(type, `Unknown DiffLineType ${type}`)
  }

  private getLineClass(): string {
    const baseClassName = 'diff-line-gutter'
    let className = baseClassName
    if (this.isIncludableLine() && this.props.isIncluded) {
      className += ' diff-line-selected'
    }

    return className + ` ${this.getLineClassName()}`
  }

  public render() {
    const className = this.getLineClass()

    return (
      <span className={className}>
        <span className='diff-line-number before'>{this.props.line.oldLineNumber || ' '}</span>
        <span className='diff-line-number after'>{this.props.line.newLineNumber || ' '}</span>
      </span>
    )
  }
}
