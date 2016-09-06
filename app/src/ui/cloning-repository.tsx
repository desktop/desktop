import * as React from 'react'

import { CloningRepository as CloningRepositoryModel } from '../lib/dispatcher'
import { ICloningRepositoryState } from '../lib/app-state'

interface ICloningRepositoryProps {
  readonly repository: CloningRepositoryModel
  readonly state: ICloningRepositoryState
}

/** The component for displaying a cloning repository's progress. */
export default class CloningRepository extends React.Component<ICloningRepositoryProps, void> {
  public render() {
    return (
      <div className='panel'>
        <div>Cloning {this.props.repository.url} to {this.props.repository.path}…</div>
        <div>{this.props.state.output}</div>
      </div>
    )
  }
}
