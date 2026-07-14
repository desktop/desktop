import * as React from 'react'
import { UiView } from '../ui-view'
import { Button } from '../lib/button'
import { Octicon, OcticonSymbol } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import {
  WelcomeLeftTopImageUri,
  WelcomeLeftBottomImageUri,
} from '../welcome/welcome'
import { IAccountRepositories } from '../../lib/stores/api-repositories-store'
import { Account, accountEquals } from '../../models/account'
import { CloneableRepositoryFilterList } from '../clone-repository/cloneable-repository-filter-list'
import { IAPIRepository } from '../../lib/api'
import { ClickSource } from '../lib/list'
import { AccountPicker } from '../account-picker'

interface INoRepositoriesProps {
  /** A function to call when the user chooses to create a repository. */
  readonly onCreate: () => void

  /** A function to call when the user chooses to clone a repository. */
  readonly onClone: (cloneURL?: string) => void

  /** A function to call when the user chooses to add a local repository. */
  readonly onAdd: () => void

  /** Called when the user chooses to create a tutorial repository */
  readonly onCreateTutorialRepository: () => void

  /** Called when the user chooses to resume a tutorial repository */
  readonly onResumeTutorialRepository: () => void

  /** true if tutorial is in paused state. */
  readonly tutorialPaused: boolean

  readonly accounts: ReadonlyArray<Account>

  /**
   * A map keyed on a user account (GitHub.com or GitHub Enterprise)
   * containing an object with repositories that the authenticated
   * user has explicit permission (:read, :write, or :admin) to access
   * as well as information about whether the list of repositories
   * is currently being loaded or not.
   *
   * If a currently signed in account is missing from the map that
   * means that the list of accessible repositories has not yet been
   * loaded. An entry for an account with an empty list of repositories
   * means that no accessible repositories was found for the account.
   *
   * See the ApiRepositoriesStore for more details on loading repositories
   */
  readonly apiRepositories: ReadonlyMap<Account, IAccountRepositories>

  /**
   * Called when the user requests a refresh of the repositories
   * available for cloning.
   */
  readonly onRefreshRepositories: (account: Account) => void
}
interface INoRepositoriesState {
  readonly selectedAccount: Account | undefined
  /**
   * The currently selected repository (if any)
   */
  readonly selectedRepository: IAPIRepository | null
  /**
   * The current filter text in the GitHub.com clone tab
   */
  readonly filterText: string
}

/**
 * The "No Repositories" view. This is shown when the user hasn't added any
 * repositories to the app.
 */
export class NoRepositoriesView extends React.Component<
  INoRepositoriesProps,
  INoRepositoriesState
> {
  private get selectedAccount() {
    return this.state.selectedAccount ?? this.props.accounts.at(0)
  }

  public constructor(props: INoRepositoriesProps) {
    super(props)

    this.state = {
      selectedRepository: null,
      selectedAccount: props.accounts.at(0),
      filterText: '',
    }
  }

  public render() {
    return (
      <UiView id="no-repositories">
        <section aria-label="Let's get started!">
          <header>
            <h1>Let's get started!</h1>
            <p>Add a repository to GitHub Desktop to start collaborating</p>
          </header>

          <div className="content">
            {this.renderRepositoryList()}
            {this.renderGetStartedActions()}
          </div>

          <img
            className="no-repositories-graphic-top"
            src={WelcomeLeftTopImageUri}
            alt=""
          />
          <img
            className="no-repositories-graphic-bottom"
            src={WelcomeLeftBottomImageUri}
            alt=""
          />
        </section>
      </UiView>
    )
  }

  public componentDidMount() {
    if (this.state.selectedAccount) {
      this.ensureRepositoriesForAccount(this.state.selectedAccount)
    }
  }

  public componentDidUpdate(
    prevProps: INoRepositoriesProps,
    prevState: INoRepositoriesState
  ) {
    if (prevProps.accounts !== this.props.accounts) {
      const currentlySelectedAccount = this.state.selectedAccount
      const newSelectedAccount =
        (currentlySelectedAccount
          ? this.props.accounts.find(a =>
              accountEquals(a, currentlySelectedAccount)
            )
          : undefined) ?? this.props.accounts.at(0)

      if (currentlySelectedAccount !== newSelectedAccount) {
        this.setState({ selectedAccount: newSelectedAccount })
        this.ensureRepositoriesForAccount(this.state.selectedAccount)
      }
    }
  }

  private ensureRepositoriesForAccount(account: Account | undefined) {
    if (account) {
      const accountState = this.props.apiRepositories.get(account)

      if (accountState === undefined) {
        this.props.onRefreshRepositories(account)
      }
    }
  }

  private isUserSignedIn() {
    return this.props.accounts.length > 0
  }

  private renderRepositoryList() {
    const account = this.selectedAccount

    if (!account) {
      // not signed in to any accounts
      return null
    }

    const accountState = this.props.apiRepositories.get(account)

    return (
      <div className="content-pane repository-list">
        {this.renderAccountPicker()}
        {this.renderAccountRepositoryList(account, accountState)}
      </div>
    )
  }

  private renderAccountPicker() {
    const { accounts } = this.props
    const selectedAccount = this.selectedAccount
    if (accounts.length < 2 || !selectedAccount) {
      return null
    }

    return (
      <AccountPicker
        accounts={accounts}
        selectedAccount={selectedAccount}
        onSelectedAccountChanged={this.onSelectedAccountChanged}
      />
    )
  }

  private onSelectedAccountChanged = (selectedAccount: Account) => {
    this.setState({ selectedAccount })
    this.ensureRepositoriesForAccount(selectedAccount)
  }

  private renderAccountRepositoryList(
    account: Account,
    accountState: IAccountRepositories | undefined
  ) {
    const loading = accountState === undefined ? true : accountState.loading

    const repositories =
      accountState === undefined ? null : accountState.repositories

    const selectedItem = this.state.selectedRepository

    return (
      <>
        <CloneableRepositoryFilterList
          account={account}
          selectedItem={selectedItem}
          filterText={this.state.filterText}
          onRefreshRepositories={this.props.onRefreshRepositories}
          loading={loading}
          repositories={repositories}
          onSelectionChanged={this.onSelectionChanged}
          onFilterTextChanged={this.onFilterTextChanged}
          onItemClicked={this.onItemClicked}
        />
        {this.renderCloneSelectedRepositoryButton(selectedItem)}
      </>
    )
  }

  private onItemClicked = (repository: IAPIRepository, source: ClickSource) => {
    if (source.kind === 'keyboard' && source.event.key === 'Enter') {
      this.onCloneSelectedRepository()
    }
  }

  private renderCloneSelectedRepositoryButton(
    selectedItem: IAPIRepository | null
  ) {
    if (selectedItem === null) {
      return null
    }

    return (
      <Button
        type="submit"
        className="clone-selected-repository"
        onClick={this.onCloneSelectedRepository}
      >
        Clone{' '}
        <strong>
          {selectedItem.owner.login}/{selectedItem.name}
        </strong>
      </Button>
    )
  }

  private onCloneSelectedRepository = () => {
    const selectedItem = this.state.selectedRepository

    if (selectedItem !== null) {
      this.props.onClone(selectedItem.clone_url)
    }
  }

  private onSelectionChanged = (selectedRepository: IAPIRepository | null) => {
    this.setState({ selectedRepository })
  }

  private onFilterTextChanged = (filterText: string) => {
    this.setState({ filterText })
  }

  // Note: this wrapper is necessary in order to ensure
  // `onClone` does not get passed a click event
  // and accidentally interpret that as a url
  // See https://github.com/desktop/desktop/issues/8394
  private onShowClone = () => this.props.onClone()

  private renderButtonGroupButton(
    symbol: OcticonSymbol,
    title: string,
    onClick: () => void,
    type?: 'submit',
    autoFocus?: boolean
  ) {
    return (
      <span>
        <Button onClick={onClick} type={type} autoFocus={autoFocus}>
          <Octicon symbol={symbol} />
          <div>{title}</div>
        </Button>
      </span>
    )
  }

  private renderTutorialRepositoryButton() {
    // No tutorial if you're not signed in.
    if (!this.isUserSignedIn()) {
      return null
    }

    if (this.props.tutorialPaused) {
      return this.renderButtonGroupButton(
        octicons.mortarBoard,
        __DARWIN__
          ? 'Return to In Progress Tutorial'
          : 'Return to in progress tutorial',
        this.props.onResumeTutorialRepository,
        'submit'
      )
    } else {
      return this.renderButtonGroupButton(
        octicons.mortarBoard,
        __DARWIN__
          ? 'Create a Tutorial Repository…'
          : 'Create a tutorial repository…',
        this.props.onCreateTutorialRepository,
        'submit'
      )
    }
  }

  private renderCloneButton() {
    return this.renderButtonGroupButton(
      octicons.repoClone,
      __DARWIN__
        ? 'Clone a Repository from the Internet…'
        : 'Clone a repository from the Internet…',
      this.onShowClone,
      undefined,
      !this.isUserSignedIn()
    )
  }

  private renderCreateRepositoryButton() {
    return this.renderButtonGroupButton(
      octicons.plus,
      __DARWIN__
        ? 'Create a New Repository on your Local Drive…'
        : 'Create a New Repository on your local drive…',
      this.props.onCreate
    )
  }

  private renderAddExistingRepositoryButton() {
    return this.renderButtonGroupButton(
      octicons.fileDirectory,
      __DARWIN__
        ? 'Add an Existing Repository from your Local Drive…'
        : 'Add an Existing Repository from your local drive…',
      this.props.onAdd
    )
  }

  private renderGetStartedActions() {
    return (
      <div className="content-pane">
        <div className="button-group">
          {this.renderTutorialRepositoryButton()}
          {this.renderCloneButton()}
          {this.renderCreateRepositoryButton()}
          {this.renderAddExistingRepositoryButton()}
        </div>

        <div className="drag-drop-info">
          <Octicon symbol={octicons.lightBulb} />
          <div>
            <strong>ProTip!</strong> You can drag &amp; drop an existing
            repository folder here to add it to Desktop
          </div>
        </div>
      </div>
    )
  }
}
