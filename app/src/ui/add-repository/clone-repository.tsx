import { remote } from 'electron'
import * as Path from 'path'
import * as React from 'react'
import * as FS from 'fs'
import { TextBox } from '../lib/text-box'
import { Button } from '../lib/button'
import { ButtonGroup } from '../lib/button-group'
import { Dispatcher } from '../../lib/dispatcher'
import { getDefaultDir, setDefaultDir } from '../lib/default-dir'
import { Row } from '../lib/row'
import { Account } from '../../models/account'
import { parseOwnerAndName, IRepositoryIdentifier } from '../../lib/remote-parsing'
import { findAccountForRemote } from '../../lib/find-account'
import { API } from '../../lib/api'
import { Dialog, DialogContent, DialogError, DialogFooter } from '../dialog'
import { logError } from '../../lib/logging/renderer'

/** The name for the error when the destination already exists. */
const DestinationExistsErrorName = 'DestinationExistsError'

interface ICloneRepositoryProps {
  readonly dispatcher: Dispatcher
  readonly onDismissed: () => void

  /** The logged in accounts. */
  readonly accounts: ReadonlyArray<Account>

  /** The initial URL or `owner/name` shortcut to use. */
  readonly initialURL: string | null
}

interface ICloneRepositoryState {
  /** The user-entered URL or `owner/name` shortcut. */
  readonly url: string

  /** The local path to clone to. */
  readonly path: string

  /** Are we currently trying to load the entered repository? */
  readonly loading: boolean

  /** The current error if one occurred. */
  readonly error: Error | null

  /**
   * The repository identifier that was last parsed from the user-entered URL.
   */
  readonly lastParsedIdentifier: IRepositoryIdentifier | null
}

/** The component for cloning a repository. */
export class CloneRepository extends React.Component<ICloneRepositoryProps, ICloneRepositoryState> {
  public constructor(props: ICloneRepositoryProps) {
    super(props)

    this.state = {
      url: '',
      path: getDefaultDir(),
      loading: false,
      error: null,
      lastParsedIdentifier: null,
    }
  }

  public componentDidMount() {
    if (this.props.initialURL) {
      this.onURLChanged(this.props.initialURL)
    }
  }

  public componentWillReceiveProps(nextProps: ICloneRepositoryProps) {
    if (nextProps.initialURL && nextProps.initialURL !== this.props.initialURL) {
      this.onURLChanged(nextProps.initialURL)
    }
  }

  public render() {
    const error = this.state.error
    const disabled =
      this.state.url.length === 0 ||
      this.state.path.length === 0 ||
      this.state.loading ||
      !!error && error.name === DestinationExistsErrorName

    return (
      <Dialog
        className='clone-repository'
        title='Clone a repository'
        onSubmit={this.clone}
        onDismissed={this.props.onDismissed}
        loading={this.state.loading}>
        {error ? <DialogError>{error.message}</DialogError> : null}

        <DialogContent>
          <p>
            Enter a repository URL or GitHub username and repository (e.g., <span className='repository-pattern'>hubot/cool-repo</span>)
          </p>

          <Row>
            <TextBox
              placeholder='URL or username/repository'
              value={this.state.url}
              onValueChanged={this.onURLChanged}
              autoFocus/>
          </Row>

          <Row>
            <TextBox
              value={this.state.path}
              label={__DARWIN__ ? 'Local Path' : 'Local path'}
              placeholder='repository path'
              onChange={this.onPathChanged}/>
            <Button onClick={this.showFilePicker}>Choose…</Button>
          </Row>
        </DialogContent>

        <DialogFooter>
          <ButtonGroup>
            <Button disabled={disabled} type='submit'>Clone</Button>
            <Button onClick={this.props.onDismissed}>Cancel</Button>
          </ButtonGroup>
        </DialogFooter>
      </Dialog>
    )
  }

  private showFilePicker = () => {
    const directory: string[] | null = remote.dialog.showOpenDialog({
      properties: [ 'createDirectory', 'openDirectory' ],
    })
    if (!directory) { return }

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
      if (this.state.path !== newPath) { return }

      let error: Error | null = null
      if (exists) {
        error = new Error('The destination already exists.')
        error.name = DestinationExistsErrorName
      }

      this.setState({ error })
    })
  }

  private onURLChanged = (input: string) => {
    const url = input
    const parsed = parseOwnerAndName(url)
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

  /**
   * Lookup the account associated with the clone (if applicable) and resolve
   * the repository alias to the clone URL.
   */
  private async resolveCloneDetails(): Promise<{ url: string, account: Account | null } | null> {
    const identifier = this.state.lastParsedIdentifier
    let url = this.state.url

    const account = await findAccountForRemote(url, this.props.accounts)
    if (!account) { return null }

    if (identifier) {
      const api = new API(account)
      const repo = await api.fetchRepository(identifier.owner, identifier.name)
      if (repo) {
        url =  repo.clone_url
      }
    }

    return { url, account }
  }

  private clone = async () => {
    this.setState({ loading: true })

    const path = this.state.path
    const cloneDetails = await this.resolveCloneDetails()
    if (!cloneDetails) {
      const error = new Error(`We couldn't find that repository. Check that you are logged in, and the URL or repository alias are spelled correctly.`)
      this.setState({ loading: false, error })
      return
    }

    try {
      this.cloneImpl(cloneDetails.url, path, cloneDetails.account)
    } catch (e) {
      logError(`CloneRepostiory: clone failed to complete to ${path}`, e)
      this.setState({ loading: false, error: e })
    }
  }

  private cloneImpl(url: string, path: string, account: Account | null) {
    this.props.dispatcher.clone(url, path, { account })
    this.props.onDismissed()

    setDefaultDir(Path.resolve(path, '..'))
  }
}
