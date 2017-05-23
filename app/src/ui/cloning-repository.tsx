import * as React from 'react'

import { CloningRepository } from '../lib/dispatcher'
import { ICloneProgress } from '../lib/app-state'
import { Octicon, OcticonSymbol } from './octicons'
import { UiView } from './ui-view'

interface ICloningRepositoryProps {
  readonly repository: CloningRepository
  readonly progress: ICloneProgress
}

/** The component for displaying a cloning repository's progress. */
export class CloningRepositoryView extends React.Component<ICloningRepositoryProps, void> {
  public render() {

    /* The progress element won't take null for an answer.
     * Only way to get it to be indeterminate is by using undefined */
    const progressValue = this.props.progress.value || undefined

    return (
      <UiView id='cloning-repository-view'>
        <div className='title-container'>
          <Octicon symbol={OcticonSymbol.desktopDownload} />
          <div className='title'>Cloning {this.props.repository.name}</div>
        </div>
        <progress value={progressValue} />
        <div className='details'>{this.props.progress.description}</div>
      </UiView>
    )
  }
}
