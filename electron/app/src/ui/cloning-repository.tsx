import * as React from 'react'

import { CloningRepository } from '../models/cloning-repository'
import { ICloneProgress } from '../models/progress'
import { Octicon } from './octicons'
import * as octicons from './octicons/octicons.generated'
import { UiView } from './ui-view'
import { TooltippedContent } from './lib/tooltipped-content'

interface ICloningRepositoryProps {
  readonly repository: CloningRepository
  readonly progress: ICloneProgress
}

/** The component for displaying a cloning repository's progress. */
export class CloningRepositoryView extends React.Component<
  ICloningRepositoryProps,
  {}
> {
  public render() {
    /* The progress element won't take null for an answer.
     * Only way to get it to be indeterminate is by using undefined */
    const progressValue = this.props.progress.value || undefined

    return (
      <UiView id="cloning-repository-view">
        <div className="title-container">
          <Octicon symbol={octicons.desktopDownload} />
          <div className="title">Cloning {this.props.repository.name}</div>
        </div>
        <progress value={progressValue} />
        <TooltippedContent
          tagName="div"
          className="details"
          tooltip={this.props.progress.description}
        >
          {this.props.progress.description}
        </TooltippedContent>
      </UiView>
    )
  }
}
