import * as React from 'react'

import { CloningRepository as CloningRepositoryModel } from '../lib/dispatcher'

interface ICloningRepositoryProps {
  readonly repository: CloningRepositoryModel
  readonly progress: string
}

/** The component for displaying a cloning repository's progress. */
export default class CloningRepository extends React.Component<ICloningRepositoryProps, void> {
  public render() {
    return (
      <div className='panel'>
        <div>Cloning {this.props.repository.url} to {this.props.repository.path}…</div>
        <div>{this.props.progress}</div>
      </div>
    )
  }
}
