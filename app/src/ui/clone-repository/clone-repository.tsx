import * as Path from 'path'
import * as FS from 'fs'
import * as React from 'react'
import { remote } from 'electron'
import { Button } from '../lib/button'
import { ButtonGroup } from '../lib/button-group'
import { Dispatcher } from '../../lib/dispatcher'
import { getDefaultDir, setDefaultDir } from '../lib/default-dir'
import { Account } from '../../models/account'
import {
  IRepositoryIdentifier,
  parseRepositoryIdentifier,
} from '../../lib/remote-parsing'
import { findAccountForRemoteURL } from '../../lib/find-account'
import { API } from '../../lib/api'
import { Dialog, DialogError, DialogFooter } from '../dialog'
import { TabBar } from '../tab-bar'
import { CloneRepositoryTab } from '../../models/clone-repository-tab'
import { CloneGenericRepository } from './clone-generic-repository'
import { CloneGithubRepository } from './clone-github-repository'

/** The name for the error when the destination already exists. */
const DestinationExistsErrorName = 'DestinationExistsError'

interface ICloneRepositoryProps {
  readonly dispatcher: Dispatcher
  readonly onDismissed: () => void

  /** The logged in accounts. */
  readonly accounts: ReadonlyArray<Account>

  /** The initial URL or `owner/name` shortcut to use. */
  readonly initialURL: string | null

  /** The initial tab to open on load
   */
  readonly initialSelectedTab?: CloneRepositoryTab
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

  /**
   * The default tab to open on load
   */
  readonly selectedIndex: CloneRepositoryTab
}

/** The component for cloning a repository. */
export class CloneRepository extends React.Component<
  ICloneRepositoryProps,
  ICloneRepositoryState
> {
  public constructor(props: ICloneRepositoryProps) {
    super(props)

    this.state = {
      url: '',
      path: getDefaultDir(),
      loading: false,
      error: null,
      lastParsedIdentifier: null,
      selectedIndex: this.props.initialSelectedTab || CloneRepositoryTab.GitHub,
    }
  }

  public render() {
    const error = this.state.error
    const disabled =
      this.state.url.length === 0 ||
      this.state.path.length === 0 ||
      this.state.loading ||
      (!!error && error.name === DestinationExistsErrorName)

    return (
      <Dialog
        className="clone-repository"
        title="Clone a repository"
        onSubmit={this.clone}
        onDismissed={this.props.onDismissed}
        loading={this.state.loading}
      >
        <TabBar
          onTabClicked={this.onTabClicked}
          selectedIndex={this.state.selectedIndex}
        >
          <span>GitHub</span>
          <span>URL</span>
        </TabBar>

        {error
          ? <DialogError>
              {error.message}
            </DialogError>
          : null}

        {this.renderActiveTab()}

        <DialogFooter>
          <ButtonGroup>
            <Button disabled={disabled} type="submit">
              Clone
            </Button>
            <Button onClick={this.props.onDismissed}>Cancel</Button>
          </ButtonGroup>
        </DialogFooter>
      </Dialog>
    )
  }

  private onTabClicked = (index: number) => {
    this.setState({ selectedIndex: index })
  }

  private renderActiveTab() {
    const index = this.state.selectedIndex

    if (index === CloneRepositoryTab.Generic) {
      return (
        <CloneGenericRepository
          initialURL={this.props.initialURL}
          onPathChanged={this.updatePath}
          onUrlChanged={this.updateUrl}
          onChooseDirectory={this.onChooseDirectory}
        />
      )
    } else {
      const account = this.props.accounts[0]
      const api = API.fromAccount(account)

      return (
        <CloneGithubRepository
          api={api}
          onPathChanged={this.updatePath}
          onGitHubRepositorySelected={this.onGitHubRepositorySelected}
          onChooseDirectory={this.onChooseDirectory}
          onDismissed={this.props.onDismissed}
        />
      )
    }
  }

  private updatePath = (path: string) => {
    this.setState({ path: path })
  }

  private onChooseDirectory = async () => {
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

    this.updatePath(directory)

    const doesDirectoryExist = await this.doesPathExist(directory)

    if (doesDirectoryExist) {
      const error: Error = new Error('The destination already exists.')
      error.name = DestinationExistsErrorName

      this.setState({ error })
    }

    return directory
  }

  private updateUrl = async (input: string) => {
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

    this.setState({
      url,
      path: newPath,
      lastParsedIdentifier: parsed,
    })

    if (pathExist) {
      const error: Error = new Error('The destination already exists.')
      error.name = DestinationExistsErrorName

      this.setState({ error })
    }

    this.updatePath(newPath)
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

  private onGitHubRepositorySelected = async (url: string) => {
    this.setState({ url })
  }

  /**
   * Lookup the account associated with the clone (if applicable) and resolve
   * the repository alias to the clone URL.
   */
  private async resolveCloneURL(): Promise<string | null> {
    const identifier = this.state.lastParsedIdentifier
    let url = this.state.url

    const account = await findAccountForRemoteURL(url, this.props.accounts)
    if (identifier && account) {
      const api = API.fromAccount(account)
      const repo = await api.fetchRepository(identifier.owner, identifier.name)
      if (repo) {
        url = repo.clone_url
      }
    }

    return url
  }

  private clone = async () => {
    this.setState({ loading: true })

    const url = await this.resolveCloneURL()
    const path = this.state.path

    if (!url) {
      const error = new Error(
        `We couldn't find that repository. Check that you are logged in, and the URL or repository alias are spelled correctly.`
      )
      this.setState({ loading: false, error })
      return
    }

    try {
      this.cloneImpl(url, path)
    } catch (e) {
      log.error(`CloneRepostiory: clone failed to complete to ${path}`, e)
      this.setState({ loading: false, error: e })
    }
  }

  private cloneImpl(url: string, path: string) {
    this.props.dispatcher.clone(url, path)
    this.props.onDismissed()

    setDefaultDir(Path.resolve(path, '..'))
  }
}
