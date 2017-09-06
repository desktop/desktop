import * as Path from 'path'
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

import { enablePreviewFeatures } from '../../lib/feature-flag'
import { pathExists } from '../../lib/file-system'
import { assertNever } from '../../lib/fatal-error'

/** The name for the error when the destination already exists. */
const DestinationExistsErrorName = 'DestinationExistsError'

interface ICloneRepositoryProps {
  readonly dispatcher: Dispatcher
  readonly onDismissed: () => void

  /** The logged in accounts. */
  readonly dotComAccount: Account | null

  /** The logged in Enterprise account. */
  readonly enterpriseAccount: Account | null

  /** The initial URL or `owner/name` shortcut to use. */
  readonly initialURL: string | null

  /** The initial tab to open on load */
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
  readonly selectedTab: CloneRepositoryTab
}

/** The component for cloning a repository. */
export class CloneRepository extends React.Component<
  ICloneRepositoryProps,
  ICloneRepositoryState
> {
  public constructor(props: ICloneRepositoryProps) {
    super(props)

    this.state = {
      url: this.props.initialURL || '',
      path: getDefaultDir(),
      loading: false,
      error: null,
      lastParsedIdentifier: null,
      selectedTab: this.props.initialSelectedTab || CloneRepositoryTab.GitHub,
    }
  }

  public render() {
    if (enablePreviewFeatures()) {
      return this.renderPreviewInterface()
    } else {
      return this.renderClassicInterface()
    }
  }

  private renderPreviewInterface() {
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
          selectedIndex={this.state.selectedTab}
        >
          <span>GitHub</span>
          {this.props.enterpriseAccount ? <span>GitHub Enterprise</span> : null}
          <span>URL</span>
        </TabBar>

        {error ? <DialogError>{error.message}</DialogError> : null}

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

  private renderClassicInterface() {
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
        {error ? <DialogError>{error.message}</DialogError> : null}

        <CloneGenericRepository
          url={this.state.url}
          path={this.state.path}
          onPathChanged={this.updatePath}
          onUrlChanged={this.updateUrl}
          onChooseDirectory={this.onChooseDirectory}
        />

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
    this.setState({ selectedTab: index })
  }

  private renderActiveTab() {
    const tab = this.state.selectedTab

    switch (tab) {
      case CloneRepositoryTab.Generic:
        return (
          <CloneGenericRepository
            path={this.state.path}
            url={this.state.url}
            onPathChanged={this.updatePath}
            onUrlChanged={this.updateUrl}
            onChooseDirectory={this.onChooseDirectory}
          />
        )

      case CloneRepositoryTab.GitHub: {
        const account = this.props.dotComAccount
        if (!account) {
          return null
        }

        return (
          <CloneGithubRepository
            path={this.state.path}
            account={account}
            onPathChanged={this.updatePath}
            onGitHubRepositorySelected={this.updateUrl}
            onChooseDirectory={this.onChooseDirectory}
            onDismissed={this.props.onDismissed}
          />
        )
      }
      case CloneRepositoryTab.Enterprise:
        return (
          <CloneGithubRepository
            path={this.state.path}
            account={this.props.enterpriseAccount!}
            onPathChanged={this.updatePath}
            onGitHubRepositorySelected={this.updateUrl}
            onChooseDirectory={this.onChooseDirectory}
            onDismissed={this.props.onDismissed}
          />
        )
    }

    return assertNever(tab, `Unknown tab: ${tab}`)
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
    } else {
      this.setState({ error: null })
    }

    return directory
  }

  private updateUrl = async (url: string) => {
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

    let error = null

    if (pathExist) {
      error = new Error('The destination already exists.')
      error.name = DestinationExistsErrorName
    }

    this.setState({
      url,
      path: newPath,
      lastParsedIdentifier: parsed,
      error,
    })
  }

  private async doesPathExist(path: string) {
    const exists = await pathExists(path)
    // If the path changed while we were checking, we don't care anymore.
    if (this.state.path !== path) {
      return
    }

    return exists
  }

  /**
   * Lookup the account associated with the clone (if applicable) and resolve
   * the repository alias to the clone URL.
   */
  private async resolveCloneURL(): Promise<string | null> {
    const identifier = this.state.lastParsedIdentifier
    let url = this.state.url
    const accounts: Array<Account> = []
    if (this.props.dotComAccount) {
      accounts.push(this.props.dotComAccount)
    }

    if (this.props.enterpriseAccount) {
      accounts.push(this.props.enterpriseAccount)
    }

    const account = await findAccountForRemoteURL(url, accounts)
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
