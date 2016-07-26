import * as React from 'react'

import { DiffLineType } from '../lib/local-git-operations'

interface IFileDiffLineProps {
  readonly text: string
  readonly type: DiffLineType
  readonly oldLineNumber: number | null
  readonly newLineNumber: number | null
}

export default class FileDiffLine extends React.Component<IFileDiffLineProps, void> {

  private map(type: DiffLineType): string {
    if (type === DiffLineType.Add) {
      return 'diff-add'
    } else if (type === DiffLineType.Delete) {
      return 'diff-delete'
    }
    return 'diff-context'
  }

  public render() {
    const className = 'diff-text ' + this.map(this.props.type)

    return (
      <div className={className}>
        <span className='before'>{this.props.oldLineNumber}</span>
        <span className='after'>{this.props.newLineNumber}</span>
        <span className='text'>{this.props.text}</span>
      </div >)
  }
}
