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
      <div className='panel'>
        <input value={this.state.path} onChange={event => this.onPathChanged(event)}>
          <label>Local Path</label>
        </input>

        <button onClick={() => this.showFilePicker()}>Choose…</button>
      </div>
    )
  }

  private onPathChanged(event: React.FormEvent<HTMLInputElement>) {
    const path = event.target.value
    this.setState({ path })
  }

  private showFilePicker() {

  }
}
