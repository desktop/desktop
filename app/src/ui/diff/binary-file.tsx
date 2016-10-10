import * as React from 'react'

import { Repository } from '../../models/repository'

interface IBinaryFileProps {
  readonly repository: Repository
  readonly path: string
}

/** A component which renders a diff for a file. */
export class BinaryFile extends React.Component<IBinaryFileProps, void> {

  public render() {
    return <div className='panel' id='diff'>
      <div>This binary file has changed</div>
    </div>
  }
}
