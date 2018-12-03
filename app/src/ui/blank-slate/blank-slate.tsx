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

interface IBlankSlateProps {
  /** A function to call when the user chooses to create a repository. */
  readonly onCreate: () => void

  /** A function to call when the user chooses to clone a repository. */
  readonly onClone: () => void

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

interface IBlankSlateState {
  readonly selectedAccount: 'dotcom' | 'enterprise'
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
      selectedAccount: 'dotcom',
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
    if (this.props.apiRepositories !== prevProps.apiRepositories) {
      this.ensureRepositoriesForAccount(this.getSelectedAccount())
    }
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
    const { selectedAccount } = this.state

    if (selectedAccount === 'dotcom') {
      return this.props.dotComAccount || this.props.enterpriseAccount
    } else {
      return this.props.enterpriseAccount || this.props.dotComAccount
    }
  }

  private renderLeftPanel() {
    const account = this.getSelectedAccount()

    if (account === null) {
      // not signed in to any accounts
      return null
    }

    const accountState = this.props.apiRepositories.get(account)

    if (accountState === undefined) {
      // no repositories loaded yet
      return null
    }

    return (
      <div className="content-pane">
        {JSON.stringify({
          account,
          accountState: accountState
            ? {
                loading: accountState.loading,
                repositories: accountState.repositories.length,
              }
            : undefined,
        })}
      </div>
    )
  }

  private renderRightPanel() {
    return (
      <div className="content-pane">
        <ul className="button-group">
          <li>
            <Button onClick={this.props.onClone}>
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
