import * as React from 'react'

import { DiffLineType } from '../lib/local-git-operations'

interface IFileDiffLineProps {
  readonly text: string
  readonly type: DiffLineType
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
        {this.props.text}
      </div >)
  }
}
