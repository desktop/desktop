import * as React from 'react'
import { TextBox } from '../lib/text-box'
import { Button } from '../lib/button'
import { getDefaultDir } from '../lib/default-dir'
import { Row } from '../lib/row'
import { IRepositoryIdentifier } from '../../lib/remote-parsing'
import { DialogContent } from '../dialog'
import { Monospaced } from '../lib/monospaced'

interface ICloneGenericRepositoryProps {
  /** The initial URL or `owner/name` shortcut to use. */
  readonly initialURL: string | null

  readonly onPathChanged: (path: string) => void

  readonly onUrlChanged: (url: string) => void

  readonly onChooseDirectory: () => Promise<string | undefined>
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
      this.props.onUrlChanged(this.props.initialURL)
    }
  }

  public componentWillReceiveProps(nextProps: ICloneGenericRepositoryProps) {
    if (
      nextProps.initialURL &&
      nextProps.initialURL !== this.props.initialURL
    ) {
      this.props.onUrlChanged(nextProps.initialURL)
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
            onValueChanged={this.onUrlChanged}
            autoFocus={true}
          />
        </Row>

        <Row>
          <TextBox
            value={this.state.path}
            label={__DARWIN__ ? 'Local Path' : 'Local path'}
            placeholder="repository path"
            onValueChanged={this.props.onPathChanged}
          />
          <Button onClick={this.onChooseDirectory}>Choose…</Button>
        </Row>
      </DialogContent>
    )
  }

  private onChooseDirectory = async () => {
    const path = await this.props.onChooseDirectory()

    if (path) {
      this.setState({ path })
    }
  }

  private onUrlChanged = (url: string) => {
    this.setState({ url })
    this.props.onUrlChanged(url)
  }
}
