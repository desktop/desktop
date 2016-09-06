import * as React from 'react'

import { CloningRepository as CloningRepositoryModel } from '../lib/dispatcher'
import { ICloningRepositoryState } from '../lib/app-state'
import { Octicon, OcticonSymbol } from './octicons'

interface ICloningRepositoryProps {
  readonly repository: CloningRepositoryModel
  readonly state: ICloningRepositoryState
}

/** The component for displaying a cloning repository's progress. */
export default class CloningRepository extends React.Component<ICloningRepositoryProps, void> {
  public render() {
    return (
      <div id='cloning-repository-view'>
        <div className='title-container'>
          <Octicon symbol={OcticonSymbol.desktopDownload} />
          <div className='title'>Cloning {this.props.repository.name}</div>
        </div>
        <progress value={this.props.state.progressValue} />
        <div className='details'>{this.props.state.output}</div>
      </div>
    )
  }
}
