import * as React from 'react'

import { CloningRepository } from '../models/cloning-repository'
import { ICloneProgress } from '../models/progress'
import { Octicon } from './octicons'
import * as OcticonSymbol from './octicons/octicons.generated'
import { UiView } from './ui-view'
import {Dispatcher} from "./dispatcher";
import {Button} from "./lib/button";

interface ICloningRepositoryProps {
  readonly dispatcher: Dispatcher
  readonly repository: CloningRepository
  readonly progress: ICloneProgress
}

/** The component for displaying a cloning repository's progress. */
export class CloningRepositoryView extends React.Component<
  ICloningRepositoryProps,
  {}
> {

    public constructor(props: ICloningRepositoryProps) {
        super(props);
        this.cancelClone = this.cancelClone.bind(this);
    }

    private cancelClone = () => {
        console.log("cacel click");
        this.props.dispatcher.cancelCloningRepository(this.props.repository);
    }

  public render() {
    /* The progress element won't take null for an answer.
     * Only way to get it to be indeterminate is by using undefined */
    const progressValue = this.props.progress.value || undefined;


    return (
      <UiView id="cloning-repository-view">
        <div className="title-container">
          <Octicon symbol={OcticonSymbol.desktopDownload} />
          <div className="title">Cloning {this.props.repository.name}</div>
        </div>
        <progress value={progressValue} />
          <Button onClick={this.cancelClone}>
              Cancel Clone
          </Button>
        <div title={this.props.progress.description} className="details">
          {this.props.progress.description}
        </div>
      </UiView>
    )
  }
}
