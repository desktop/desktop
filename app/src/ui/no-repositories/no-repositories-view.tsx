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
import { Account } from '../../models/account'
import { TabBar } from '../tab-bar'
import { CloneableRepositoryFilterList } from '../clone-repository/cloneable-repository-filter-list'
import { IAPIRepository } from '../../lib/api'
import { assertNever } from '../../lib/fatal-error'
import { ClickSource } from '../lib/list'

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

  /** The logged in account for GitHub.com. */
  readonly dotComAccount: Account | null

  /** The logged in account for GitHub Enterprise. */
  readonly enterpriseAccount: Account | null

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

/**
 * An enumeration of all the tabs potentially available for
 * selection.
 */
enum AccountTab {
  dotCom,
  enterprise,
}

interface INoRepositoriesState {
  /**
   * The selected account, or rather the preferred selection.
   * Has no effect when the user isn't signed in to any account.
   * If the selected account is GitHub.com and the user signs out
   * of that account they will be coerced onto the Enterprise tab
   * if that account is signed in, see the getSelectedAccount
   * method.
   */
  readonly selectedTab: AccountTab

  /**
   * The currently selected repository (if any) in the GitHub.com
   * tab.
   */
  readonly selectedDotComRepository: IAPIRepository | null

  /**
   * The current filter text in the GitHub.com clone tab
   */
  readonly dotComFilterText: string

  /**
   * The currently selected repository (if any) in the GitHub
   * Enterprise tab.
   */
  readonly selectedEnterpriseRepository: IAPIRepository | null

  /**
   * The current filter text in the GitHub.com clone tab
   */
  readonly enterpriseFilterText: string
}

/**
 * The "No Repositories" view. This is shown when the user hasn't added any
 * repositories to the app.
 */
export class NoRepositoriesView extends React.Component<
  INoRepositoriesProps,
  INoRepositoriesState
> {
  public constructor(props: INoRepositoriesProps) {
    super(props)

    this.state = {
      selectedTab: AccountTab.dotCom,
      dotComFilterText: '',
      enterpriseFilterText: '',
      selectedDotComRepository: null,
      selectedEnterpriseRepository: null,
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
    this.ensureRepositoriesForAccount(this.getSelectedAccount())
  }

  public componentDidUpdate(
    prevProps: INoRepositoriesProps,
    prevState: INoRepositoriesState
  ) {
    if (
      prevProps.dotComAccount !== this.props.dotComAccount ||
      prevProps.enterpriseAccount !== this.props.enterpriseAccount ||
      prevState.selectedTab !== this.state.selectedTab
    ) {
      this.ensureRepositoriesForAccount(this.getSelectedAccount())
    }
  }

  private ensureRepositoriesForAccount(account: Account | null) {
    if (account !== null) {
      const accountState = this.props.apiRepositories.get(account)

      if (accountState === undefined) {
        this.props.onRefreshRepositories(account)
      }
    }
  }

  private isUserSignedIn() {
    return (
      this.props.dotComAccount !== null || this.props.enterpriseAccount !== null
    )
  }

  private getSelectedAccount() {
    const { selectedTab } = this.state
    if (selectedTab === AccountTab.dotCom) {
      return this.props.dotComAccount || this.props.enterpriseAccount
    } else if (selectedTab === AccountTab.enterprise) {
      return this.props.enterpriseAccount || this.props.dotComAccount
    } else {
      return assertNever(selectedTab, `Unknown account tab ${selectedTab}`)
    }
  }

  private renderRepositoryList() {
    const account = this.getSelectedAccount()

    if (account === null) {
      // not signed in to any accounts
      return null
    }

    const accountState = this.props.apiRepositories.get(account)

    return (
      <div className="content-pane repository-list">
        {this.renderAccountsTabBar()}
        {this.renderAccountRepositoryList(account, accountState)}
      </div>
    )
  }

  private getSelectedItemForAccount(account: Account) {
    return account === this.props.dotComAccount
      ? this.state.selectedDotComRepository
      : this.state.selectedEnterpriseRepository
  }

  private renderAccountRepositoryList(
    account: Account,
    accountState: IAccountRepositories | undefined
  ) {
    const loading = accountState === undefined ? true : accountState.loading

    const repositories =
      accountState === undefined ? null : accountState.repositories

    const selectedItem = this.getSelectedItemForAccount(account)

    const filterText =
      account === this.props.dotComAccount
        ? this.state.dotComFilterText
        : this.state.enterpriseFilterText

    return (
      <>
        <CloneableRepositoryFilterList
          account={account}
          selectedItem={selectedItem}
          filterText={filterText}
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
    const selectedAccount = this.getSelectedAccount()
    if (selectedAccount === null) {
      return
    }

    const selectedItem = this.getSelectedItemForAccount(selectedAccount)

    if (selectedItem === null) {
      return
    }

    this.props.onClone(selectedItem.clone_url)
  }

  private onSelectionChanged = (selectedItem: IAPIRepository | null) => {
    const account = this.getSelectedAccount()
    if (account === this.props.dotComAccount) {
      this.setState({ selectedDotComRepository: selectedItem })
    } else if (account === this.props.enterpriseAccount) {
      this.setState({ selectedEnterpriseRepository: selectedItem })
    }
  }

  private onFilterTextChanged = (filterText: string) => {
    const account = this.getSelectedAccount()
    if (account === this.props.dotComAccount) {
      this.setState({ dotComFilterText: filterText })
    } else if (account === this.props.enterpriseAccount) {
      this.setState({ enterpriseFilterText: filterText })
    }
  }

  private renderAccountsTabBar() {
    if (
      this.props.dotComAccount === null ||
      this.props.enterpriseAccount === null
    ) {
      return null
    }

    const selectedIndex =
      this.getSelectedAccount() === this.props.dotComAccount ? 0 : 1

    return (
      <TabBar selectedIndex={selectedIndex} onTabClicked={this.onTabClicked}>
        <span>GitHub.com</span>
        <span>GitHub Enterprise</span>
      </TabBar>
    )
  }

  private onTabClicked = (index: number) => {
    if (index === 0) {
      this.setState({ selectedTab: AccountTab.dotCom })
    } else if (index === 1) {
      this.setState({ selectedTab: AccountTab.enterprise })
    }
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
