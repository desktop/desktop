import { remote } from 'electron'
import * as React from 'react'
import * as Path from 'path'
import * as OS from 'os'
import * as FS from 'fs'

import { Dispatcher } from '../../lib/dispatcher'
import { initGitRepository } from '../../lib/git/init'
import { sanitizedRepositoryName } from './sanitized-repository-name'

interface ICreateRepositoryProps {
  readonly dispatcher: Dispatcher
}

interface ICreateRepositoryState {
  readonly path: string
  readonly name: string
}

/** The Create New Repository component. */
export class CreateRepository extends React.Component<ICreateRepositoryProps, ICreateRepositoryState> {
  public constructor(props: ICreateRepositoryProps) {
    super(props)

    this.state = { path: defaultPath(), name: '' }
  }

  private onPathChanged(event: React.FormEvent<HTMLInputElement>) {
    const path = event.currentTarget.value
    this.setState({ path, name: this.state.name })
  }

  private onNameChanged(event: React.FormEvent<HTMLInputElement>) {
    const name = event.currentTarget.value
    this.setState({ path: this.state.path, name })
  }

  private showFilePicker() {
    const directory: string[] | null = remote.dialog.showOpenDialog({ properties: [ 'createDirectory', 'openDirectory' ] })
    if (!directory) { return }

    const path = directory[0]
    this.setState({ path, name: this.state.name })
  }

  private async createRepository() {
    const fullPath = Path.join(this.state.path, sanitizedRepositoryName(this.state.name))

    // NB: This exists & create check is race-y :(
    FS.exists(fullPath, exists => {
      FS.mkdir(fullPath, async () => {
        await initGitRepository(fullPath)

        this.props.dispatcher.addRepositories([ fullPath ])
        this.props.dispatcher.closePopup()
      })
    })
  }

  private renderError() {
    const sanitizedName = sanitizedRepositoryName(this.state.name)
    if (this.state.name === sanitizedName) { return null }

    return (
      <div>Will be created as {sanitizedName}</div>
    )
  }

  public render() {
    const disabled = this.state.path.length === 0 || this.state.name.length === 0
    return (
      <div id='create-repository' className='panel'>
        <div>
          <label>Name
            <input value={this.state.name}
                   placeholder='repository name'
                   onChange={event => this.onNameChanged(event)}/>
          </label>
        </div>

        {this.renderError()}

        <div className='file-picker'>
          <label>Local Path
            <input value={this.state.path}
                   placeholder='repository path'
                   onChange={event => this.onPathChanged(event)}/>
          </label>

          <button onClick={() => this.showFilePicker()}>Choose…</button>
        </div>

        <hr/>

        <button disabled={disabled} onClick={() => this.createRepository()}>
          Create Repository
        </button>
      </div>
    )
  }
}

function defaultPath() {
  return OS.homedir() + Path.sep
}
