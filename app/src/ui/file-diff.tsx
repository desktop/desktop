import * as React from 'react'

import { IRepository } from '../models/repository'

interface IFileDiffProps {
  readonly repository: IRepository
  readonly readOnly: boolean
  readonly relativePath: string | null
}

export default class FileDiff extends React.Component<IFileDiffProps, void> {

  public componentWillReceiveProps(nextProps: IFileDiffProps) {

    this.renderDiff(nextProps.repository, nextProps.relativePath, nextProps.readOnly)
  }

  private renderDiff(repository: IRepository, relativePath: string | null, readOnly: boolean) {
    if (!relativePath) {
      // TOOD: don't render anything
    } else {
      // LocalGitOperations.getDiff(repository.path, relativePath)
    }
  }

  public render() {

    if (this.props.relativePath) {
      return <div id='file-diff'>Diff for '{this.props.relativePath} goes here</div>
    } else {
      return <div id='file-diff'>No file selected</div>
    }
  }
}
