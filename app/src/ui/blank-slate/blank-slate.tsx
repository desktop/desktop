import * as React from 'react'
import { UiView } from '../ui-view'
import { Button } from '../lib/button'
import { Octicon, OcticonSymbol } from '../octicons'
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

interface IBlankSlateProps {
  /** A function to call when the user chooses to create a repository. */
  readonly onCreate: () => void

  /** A function to call when the user chooses to clone a repository. */
  readonly onClone: (cloneURL?: string | null) => void

  /** A function to call when the user chooses to add a local repository. */
  readonly onAdd: () => void

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

interface IBlankSlateState {
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
 * The blank slate view. This is shown when the user hasn't added any
 * repositories to the app.
 */
export class BlankSlateView extends React.Component<
  IBlankSlateProps,
  IBlankSlateState
> {
  public constructor(props: IBlankSlateProps) {
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
      <UiView id="blank-slate">
        <header>
          <h1>Let's get started!</h1>
          <p>Add a repository to GitHub Desktop to start collaborating</p>
        </header>

        <div className="content">
          {this.renderLeftPanel()}
          {this.renderRightPanel()}
        </div>

        <img className="blankslate-graphic-top" src={WelcomeLeftTopImageUri} />
        <img
          className="blankslate-graphic-bottom"
          src={WelcomeLeftBottomImageUri}
        />
      </UiView>
    )
  }

  public componentDidMount() {
    this.ensureRepositoriesForAccount(this.getSelectedAccount())
  }

  public componentDidUpdate(prevProps: IBlankSlateProps) {
    this.ensureRepositoriesForAccount(this.getSelectedAccount())
  }

  private ensureRepositoriesForAccount(account: Account | null) {
    if (account !== null) {
      const accountState = this.props.apiRepositories.get(account)

      if (accountState === undefined || accountState.repositories === null) {
        this.props.onRefreshRepositories(account)
      }
    }
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

  private renderLeftPanel() {
    const account = this.getSelectedAccount()

    if (account === null) {
      // not signed in to any accounts
      return null
    }

    const accountState = this.props.apiRepositories.get(account)

    return (
      <div className="content-pane left">
        {this.renderAccountsTabBar()}
        {this.renderAccountTab(account, accountState)}
      </div>
    )
  }

  private getSelectedItemForAccount(account: Account) {
    return account === this.props.dotComAccount
      ? this.state.selectedDotComRepository
      : this.state.selectedEnterpriseRepository
  }

  private renderAccountTab(
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
        />
        {this.renderCloneSelectedRepositoryButton(selectedItem)}
      </>
    )
  }

  private renderCloneSelectedRepositoryButton(
    selectedItem: IAPIRepository | null
  ) {
    if (selectedItem === null) {
      return null
    }

    return (
      <div>
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
      </div>
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
        <span>Enterprise</span>
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

  private onShowClone = () => this.props.onClone()

  private renderRightPanel() {
    return (
      <div className="content-pane right">
        <ul className="button-group">
          <li>
            <Button onClick={this.onShowClone}>
              <Octicon symbol={OcticonSymbol.repoClone} />
              <div>
                {__DARWIN__
                  ? 'Clone a Repository from the Internet…'
                  : 'Clone a repository from the Internet…'}
              </div>
            </Button>
          </li>
          <li>
            <Button onClick={this.props.onCreate}>
              <Octicon symbol={OcticonSymbol.plus} />
              <div>
                {__DARWIN__
                  ? 'Create a New Repository on Your Hard Drive…'
                  : 'Create a New Repository on your hard drive…'}
              </div>
            </Button>
          </li>
          <li>
            <Button onClick={this.props.onAdd}>
              <Octicon symbol={OcticonSymbol.fileDirectory} />
              <div>
                {__DARWIN__
                  ? 'Add an Existing Repository from Your Hard Drive…'
                  : 'Add an Existing Repository from your hard drive…'}
              </div>
            </Button>
          </li>
        </ul>

        <div className="drag-drop-info">
          <Octicon symbol={OcticonSymbol.lightBulb} />
          <div>
            <strong>ProTip!</strong> You can drag &amp; drop an existing
            repository folder here to add it to Desktop
          </div>
        </div>
      </div>
    )
  }
}
