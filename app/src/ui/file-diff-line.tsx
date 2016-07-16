import * as React from 'react'

interface IFileDiffLineProps {
  readonly text: string
}

export default class FileDiffLine extends React.Component<IFileDiffLineProps, void> {
  public render() {
    return (<div className='diff-text'>{this.props.text}</div >)
  }
}
