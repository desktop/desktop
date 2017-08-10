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

  readonly onPathChanged: (path: string) => void

  readonly onUrlChanged: (url: string) => void
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
            onValueChanged={this.onPathChanged}
          />
          <Button onClick={this.pickAndSetDirectory}>Choose…</Button>
        </Row>
      </DialogContent>
    )
  }

  private pickAndSetDirectory = async () => {
    const directories = remote.dialog.showOpenDialog({
      properties: ['createDirectory', 'openDirectory'],
    })

    if (!directories) {
      return
    }

    const lastParsedIdentifier = this.state.lastParsedIdentifier
    const directory = lastParsedIdentifier
      ? Path.join(directories[0], lastParsedIdentifier.name)
      : directories[0]
    const doesDirectoryExist = await this.doesPathExist(directory)

    if (!doesDirectoryExist) {
      return this.onPathChanged(directory)
    }

    this.dispatchPathExistsError()
  }

  private dispatchPathExistsError() {
    const error: Error = new Error('The destination already exists.')
    error.name = DestinationExistsErrorName
    this.props.onError(error)
  }

  private doesPathExist(path: string) {
    return new Promise<boolean | undefined>((resolve, reject) => {
      // If the path changed while we were checking, we don't care anymore.
      if (this.state.path !== path) {
        return resolve()
      }

      FS.stat(path, (err, stats) => {
        if (err) {
          if (err.code === 'ENOENT') {
            return resolve(false)
          }

          return reject(err)
        }

        //File must already exist
        if (stats) {
          return resolve(true)
        }

        return resolve(false)
      })
    })
  }

  private onURLChanged = async (input: string) => {
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

    const pathExist = await this.doesPathExist(newPath)

    if (!pathExist) {
      this.setState({
        url,
        lastParsedIdentifier: parsed,
      })

      this.props.onUrlChanged(url)
      this.onPathChanged(newPath)

      return
    }

    this.dispatchPathExistsError()
  }

  private onPathChanged = (input: string) => {
    this.setState({ path: input })
    this.props.onPathChanged(input)
  }
}
