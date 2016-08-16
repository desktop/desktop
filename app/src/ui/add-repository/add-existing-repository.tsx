import { remote } from 'electron'
import * as React from 'react'

import { Dispatcher } from '../../lib/dispatcher'

interface IAddExistingRepositoryProps {
  readonly dispatcher: Dispatcher
}

interface IAddExistingRepositoryState {
  readonly path: string
}

export default class AddExistingRepository extends React.Component<IAddExistingRepositoryProps, IAddExistingRepositoryState> {
  public constructor(props: IAddExistingRepositoryProps) {
    super(props)

    this.state = { path: '' }
  }

  public render() {
    return (
      <div id='add-existing-repository' className='panel'>
        <div className='file-picker'>
          <label>Local Path
            <input value={this.state.path}
                   placeholder='repository path'
                   onChange={event => this.onPathChanged(event)}/>
          </label>

          <button onClick={() => this.showFilePicker()}>Choose…</button>
        </div>

        <hr/>

        <button>Add Repository</button>
      </div>
    )
  }

  private onPathChanged(event: React.FormEvent<HTMLInputElement>) {
    const path = event.target.value
    this.setState({ path })
  }

  private showFilePicker() {
    const directory = remote.dialog.showOpenDialog({ properties: [ 'openDirectory' ] })
    this.setState({ path: directory[0] })
  }
}
