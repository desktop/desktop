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

    /* The progress element won't take null for an answer.
     * Only way to get it to be indeterminate is by using undefined */
    const progressValue = this.props.state.progressValue == null
      ? undefined
      : this.props.state.progressValue

    return (
      <div id='cloning-repository-view'>
        <div className='title-container'>
          <Octicon symbol={OcticonSymbol.desktopDownload} />
          <div className='title'>Cloning {this.props.repository.name}</div>
        </div>
        <progress value={progressValue} />
        <div className='details'>{this.props.state.output}</div>
      </div>
    )
  }
}
