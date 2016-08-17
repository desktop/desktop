import { remote } from 'electron'
import * as React from 'react'
import * as Path from 'path'
import * as OS from 'os'
import * as FS from 'fs'

import { Dispatcher } from '../../lib/dispatcher'
import { LocalGitOperations } from '../../lib/local-git-operations'
import Repository from '../../models/repository'

const untildify: (str: string) => string = require('untildify')

interface ICreateRepositoryProps {
  readonly dispatcher: Dispatcher
}

interface ICreateRepositoryState {
  readonly path: string
}

/** The Create New Repository component. */
export default class CreateRepository extends React.Component<ICreateRepositoryProps, ICreateRepositoryState> {
  public constructor(props: ICreateRepositoryProps) {
    super(props)

    this.state = { path: defaultPath() }
  }

  private onPathChanged(event: React.FormEvent<HTMLInputElement>) {
    const path = event.target.value
    if (path[path.length - 1] === Path.sep) {
      name = ''
    } else {
      const pieces = path.split(Path.sep)
      name = pieces[pieces.length - 1]
    }

    this.setState({ path })
  }

  private onNameChanged(event: React.FormEvent<HTMLInputElement>) {
    const name = event.target.value
    const pathComponents = this.state.path.split(Path.sep)
    pathComponents.pop()

    const path = Path.join(pathComponents.join(Path.sep), name.length > 0 ? name : Path.sep)
    this.setState({ path })
  }

  private showFilePicker() {
    const directory: string[] | null = remote.dialog.showOpenDialog({ properties: [ 'createDirectory', 'openDirectory' ] })
    if (!directory) { return }

    const path = directory[0]
    this.setState({ path })
  }

  private async createRepository() {
    const resolvedPath = this.resolvedPath

    // NB: This exists & create check is race-y :(
    FS.exists(resolvedPath, exists => {
      FS.mkdir(resolvedPath, async () => {
        await LocalGitOperations.initGitRepository(resolvedPath)

        const repository = new Repository(resolvedPath)
        this.props.dispatcher.addRepositories([ repository ])
        this.props.dispatcher.closePopup()
      })
    })
  }

  private get name(): string {
    const path = this.state.path
    if (path[path.length - 1] === Path.sep) {
      return ''
    } else {
      const pieces = path.split(Path.sep)
      return pieces[pieces.length - 1]
    }
  }

  private get resolvedPath(): string {
    return untildify(this.state.path)
  }

  public render() {
    const disabled = this.state.path.length === 0 || this.name.length === 0
    return (
      <div id='create-repository' className='panel'>
        <div>
          <label>Name
            <input value={this.name}
                   placeholder='repository name'
                   onChange={event => this.onNameChanged(event)}/>
          </label>
        </div>

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
