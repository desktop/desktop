import * as React from 'react'

interface IFileDiffProps {
  path: string | null
}

export default class FileDiff extends React.Component<IFileDiffProps, void> {
  public render() {

    if (this.props.path) {
      return <div id='file-diff'>Diff for '{this.props.path} goes here</div>
    } else {
      return <div id='file-diff'>No file selected</div>
    }
  }
}
