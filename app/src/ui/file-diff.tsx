import * as React from 'react'

import IRepository from '../models/repository'

import { LocalGitOperations, Diff } from '../lib/local-git-operations'

interface IFileDiffProps {
  readonly repository: IRepository
  readonly readOnly: boolean
  readonly relativePath: string | null
}

interface IFileDiffState {
  readonly diff: Diff
}

export default class FileDiff extends React.Component<IFileDiffProps, IFileDiffState> {

  public constructor(props: IFileDiffProps) {
    super(props)

    this.state = { diff: new Diff([]) }
  }

  public componentWillReceiveProps(nextProps: IFileDiffProps) {
    this.renderDiff(nextProps.repository, nextProps.relativePath, nextProps.readOnly)
  }

  private async renderDiff(repository: IRepository, relativePath: string | null, readOnly: boolean) {
    if (!relativePath) {
      // TOOD: don't render anything
    } else {
      const diff = await LocalGitOperations.getDiff(repository, relativePath)

      this.setState(Object.assign({}, this.state, { diff }))
    }
  }

  public render() {

    if (this.props.relativePath) {
      return <div id='file-diff'>{this.state.diff}</div>
    } else {
      return <div id='file-diff'>No file selected</div>
    }
  }
}
