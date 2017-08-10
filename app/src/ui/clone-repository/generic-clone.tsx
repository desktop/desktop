import { remote } from 'electron'
import * as Path from 'path'
import * as React from 'react'
import * as FS from 'fs'
import { TextBox } from '../lib/text-box'
import { Button } from '../lib/button'
import { getDefaultDir } from '../lib/default-dir'
import { Row } from '../lib/row'
import {
  parseRepositoryIdentifier,
  IRepositoryIdentifier,
} from '../../lib/remote-parsing'
import { DialogContent } from '../dialog'
import { Monospaced } from '../lib/monospaced'

/** The name for the error when the destination already exists. */
const DestinationExistsErrorName = 'DestinationExistsError'

interface ICloneGenericRepositoryProps {
  /** The initial URL or `owner/name` shortcut to use. */
  readonly initialURL: string | null

  readonly onError: (error: Error | null) => void
}

interface ICloneGenericRepositoryState {
  /** The user-entered URL or `owner/name` shortcut. */
  readonly url: string

  /** The local path to clone to. */
  readonly path: string

  /**
   * The repository identifier that was last parsed from the user-entered URL.
   */
  readonly lastParsedIdentifier: IRepositoryIdentifier | null
}

/** The component for cloning a repository. */
export class CloneGenericRepository extends React.Component<
  ICloneGenericRepositoryProps,
  ICloneGenericRepositoryState
> {
  public constructor(props: ICloneGenericRepositoryProps) {
    super(props)

    this.state = {
      url: '',
      path: getDefaultDir(),
      lastParsedIdentifier: null,
    }
  }

  public componentDidMount() {
    if (this.props.initialURL) {
      this.onURLChanged(this.props.initialURL)
    }
  }

  public componentWillReceiveProps(nextProps: ICloneGenericRepositoryProps) {
    if (
      nextProps.initialURL &&
      nextProps.initialURL !== this.props.initialURL
    ) {
      this.onURLChanged(nextProps.initialURL)
    }
  }

  public render() {
    return (
      <DialogContent>
        <p>
          Enter a repository URL or GitHub username and repository (e.g.,{' '}
          <Monospaced>hubot/cool-repo</Monospaced>)
        </p>

        <Row>
          <TextBox
            placeholder="URL or username/repository"
            value={this.state.url}
            onValueChanged={this.onURLChanged}
            autoFocus={true}
          />
        </Row>

        <Row>
          <TextBox
            value={this.state.path}
            label={__DARWIN__ ? 'Local Path' : 'Local path'}
            placeholder="repository path"
            onChange={this.onPathChanged}
          />
          <Button onClick={this.showFilePicker}>Choose…</Button>
        </Row>
      </DialogContent>
    )
  }

  private showFilePicker = () => {
    const directory: string[] | null = remote.dialog.showOpenDialog({
      properties: ['createDirectory', 'openDirectory'],
    })
    if (!directory) {
      return
    }

    const path = directory[0]
    const lastParsedIdentifier = this.state.lastParsedIdentifier
    if (lastParsedIdentifier) {
      this.updatePath(Path.join(path, lastParsedIdentifier.name))
    } else {
      this.updatePath(path)
    }
  }

  private updatePath(newPath: string) {
    this.setState({ path: newPath })
    this.checkPathValid(newPath)
  }

  private checkPathValid(newPath: string) {
    FS.exists(newPath, exists => {
      // If the path changed while we were checking, we don't care anymore.
      if (this.state.path !== newPath) {
        return
      }

      let error: Error | null = null

      if (exists) {
        error = new Error('The destination already exists.')
        error.name = DestinationExistsErrorName
      }

      this.props.onError(error)
    })
  }

  private onURLChanged = (input: string) => {
    const url = input
    const parsed = parseRepositoryIdentifier(url)
    const lastParsedIdentifier = this.state.lastParsedIdentifier

    let newPath: string
    if (lastParsedIdentifier) {
      if (parsed) {
        newPath = Path.join(Path.dirname(this.state.path), parsed.name)
      } else {
        newPath = Path.dirname(this.state.path)
      }
    } else if (parsed) {
      newPath = Path.join(this.state.path, parsed.name)
    } else {
      newPath = this.state.path
    }

    this.setState({
      url,
      path: newPath,
      lastParsedIdentifier: parsed,
    })

    this.checkPathValid(newPath)
  }

  private onPathChanged = (event: React.FormEvent<HTMLInputElement>) => {
    const path = event.currentTarget.value
    this.updatePath(path)
  }
}
