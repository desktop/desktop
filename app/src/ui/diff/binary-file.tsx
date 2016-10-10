import * as React from 'react'

import { Repository } from '../../models/repository'

interface IBinaryFileProps {
  readonly repository: Repository
  readonly path: string
}

export class BinaryFile extends React.Component<IBinaryFileProps, void> {

  private handleClick(e: React.MouseEvent<HTMLAnchorElement>) {
    // TODO: use shell.openFile here to open the file in an external program
  }

  public render() {
    return <div className='panel' id='diff'>
      <div className='image-header'>
      This binary file has changed.
      </div>
      <div className='image-header'>
        Would you like to
        <a href='#' onClick={e => this.handleClick(e)}>open this file&nbsp;</a>
        in an external program?
      </div>
    </div>
  }
}
