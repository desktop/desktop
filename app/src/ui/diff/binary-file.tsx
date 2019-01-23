import * as React from 'react'
import * as Path from 'path'

import { Repository } from '../../models/repository'
import { openFile } from '../lib/open-file'
import { Dispatcher } from '../../lib/dispatcher/dispatcher'

import { LinkButton } from '../lib/link-button'

interface IBinaryFileProps {
  readonly repository: Repository
  readonly path: string
  readonly dispatcher: Dispatcher
}

/** represents the default view for a file that we cannot render a diff for */
export class BinaryFile extends React.Component<IBinaryFileProps, {}> {
  private open = () => {
    const fullPath = Path.join(this.props.repository.path, this.props.path)
    openFile(fullPath, this.props.dispatcher)
  }

  public render() {
    return (
      <div className="panel binary" id="diff">
        <div className="image-header">This binary file has changed.</div>
        <div className="image-header">
          <LinkButton onClick={this.open}>
            Open file in external program.
          </LinkButton>
        </div>
      </div>
    )
  }
}
