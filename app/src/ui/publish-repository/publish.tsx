import * as React from 'react'
import { PublishRepository } from './publish-repository'
import { Dispatcher } from '../dispatcher'
import { Account, isDotComAccount, isSameAccount } from '../../models/account'
import { Repository } from '../../models/repository'
import { Dialog, DialogFooter, DialogContent, DialogError } from '../dialog'
import { CallToAction } from '../lib/call-to-action'
import { LinkButton } from '../lib/link-button'
import { Row } from '../lib/row'
import { getGitDescription } from '../../lib/git'
import { showContextualMenu } from '../../lib/menu-item'
import {
  RepositoryPublicationSettings,
  PublishSettingsType,
} from '../../models/publish-settings'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { SignInResult } from '../../lib/stores/sign-in-store'

interface IPublishProps {
  readonly dispatcher: Dispatcher

  /** The repository being published. */
  readonly repository: Repository

  /** The signed in accounts. */
  readonly accounts: ReadonlyArray<Account>

  /** The function to call when the dialog should be dismissed. */
  readonly onDismissed: () => void
}

interface IPublishState {
  /** The settings for publishing the repository. */
  readonly settings: RepositoryPublicationSettings

  /**
   * An error which, if present, is presented to the
   * user in close proximity to the actions or input fields
   * related to the current step.
   */
  readonly error: Error | null

  /**
   * The account the user chose (or which was chosen for them) to publish
   * with. See `getSelectedAccount` for the account actually used.
   */
  readonly selectedAccount: Account | null

  /** Is the repository currently being published? */
  readonly publishing: boolean
}

/**
 * The signed-in account assigned to the repository, if any.
 *
 * A repository whose remote has been removed keeps its account assignment, so
 * publishing it again starts out with that account selected.
 */
function getAssignedAccount(
  repository: Repository,
  accounts: ReadonlyArray<Account>
): Account | null {
  const { gitHubRepository, login } = repository
  if (gitHubRepository === null || login === null) {
    return null
  }
  const assigned = { endpoint: gitHubRepository.endpoint, login }
  return accounts.find(a => isSameAccount(a, assigned)) ?? null
}

/**
 * The account to publish with: the chosen account while it's still signed
 * in, otherwise the only signed-in account. Returns null when the user has to
 * choose between several accounts.
 */
function resolveSelectedAccount(
  selectedAccount: Account | null,
  accounts: ReadonlyArray<Account>
): Account | null {
  const selected = accounts.find(a => isSameAccount(a, selectedAccount))
  if (selected !== undefined) {
    return selected
  }
  return accounts.length === 1 ? accounts[0] : null
}

function getSettingsKind(account: Account | null) {
  return account === null || isDotComAccount(account)
    ? PublishSettingsType.dotcom
    : PublishSettingsType.enterprise
}

/**
 * The Publish component.
 */
export class Publish extends React.Component<IPublishProps, IPublishState> {
  private mounted = false

  public constructor(props: IPublishProps) {
    super(props)

    const selectedAccount =
      getAssignedAccount(props.repository, props.accounts) ??
      resolveSelectedAccount(null, props.accounts)

    this.state = {
      settings: {
        kind: getSettingsKind(selectedAccount),
        name: props.repository.name,
        description: '',
        private: true,
        org: null,
      },
      error: null,
      selectedAccount,
      publishing: false,
    }
  }

  public render() {
    return (
      <Dialog
        id="publish-repository"
        title={__DARWIN__ ? 'Publish Repository' : 'Publish repository'}
        onDismissed={this.props.onDismissed}
        onSubmit={this.publishRepository}
        disabled={this.state.publishing}
        loading={this.state.publishing}
      >
        {this.state.error ? (
          <DialogError>{this.state.error.message}</DialogError>
        ) : null}

        {this.renderContent()}
        {this.renderFooter()}
      </Dialog>
    )
  }

  public async componentDidMount() {
    this.mounted = true

    try {
      const description = await getGitDescription(this.props.repository.path)
      if (this.mounted) {
        this.setState(({ settings }) => ({
          settings: { ...settings, description },
        }))
      }
    } catch (error) {
      log.warn(`Couldn't get the repository's description`, error)
    }
  }

  public componentDidUpdate(
    prevProps: IPublishProps,
    prevState: IPublishState
  ) {
    const previous = resolveSelectedAccount(
      prevState.selectedAccount,
      prevProps.accounts
    )
    const current = this.getSelectedAccount()

    // Organizations belong to an account, so start over when it changes.
    const changed =
      previous === null ? current !== null : !isSameAccount(previous, current)
    if (changed) {
      this.setState(({ settings }) => ({
        settings: { ...settings, kind: getSettingsKind(current), org: null },
      }))
    }
  }

  public componentWillUnmount() {
    this.mounted = false
  }

  private getSelectedAccount() {
    return resolveSelectedAccount(
      this.state.selectedAccount,
      this.props.accounts
    )
  }

  private renderContent() {
    if (this.props.accounts.length === 0) {
      return <DialogContent>{this.renderSignIn()}</DialogContent>
    }

    return (
      <PublishRepository
        account={this.getSelectedAccount()}
        accounts={this.props.accounts}
        settings={this.state.settings}
        onSettingsChanged={this.onSettingsChanged}
        onSelectedAccountChanged={this.onSelectedAccountChanged}
        onSignInToAnotherAccount={this.onSignInToAnotherAccount}
      />
    )
  }

  private onSelectedAccountChanged = (account: Account) => {
    this.setState({ selectedAccount: account })
  }

  private onSettingsChanged = (settings: RepositoryPublicationSettings) => {
    this.setState({ settings })
  }

  private renderSignIn() {
    const signInTitle = __DARWIN__ ? 'Sign In' : 'Sign in'
    return (
      <>
        <CallToAction actionTitle={signInTitle} onAction={this.signInDotCom}>
          <div>
            Sign in to your GitHub.com account to publish your repository.
          </div>
        </CallToAction>
        <Row className="sign-in-enterprise">
          <LinkButton onClick={this.signInEnterprise}>
            {__DARWIN__
              ? 'Sign In to GitHub Enterprise'
              : 'Sign in to GitHub Enterprise'}
          </LinkButton>
        </Row>
      </>
    )
  }

  private renderFooter() {
    if (this.props.accounts.length === 0) {
      return null
    }

    const disabled =
      !this.state.settings.name.length || this.getSelectedAccount() === null

    return (
      <DialogFooter>
        <OkCancelButtonGroup
          okButtonText={
            __DARWIN__ ? 'Publish Repository' : 'Publish repository'
          }
          okButtonDisabled={disabled}
        />
      </DialogFooter>
    )
  }

  private onSignInToAnotherAccount = () => {
    showContextualMenu([
      { label: 'GitHub.com', action: this.signInDotCom },
      { label: 'GitHub Enterprise', action: this.signInEnterprise },
    ])
  }

  /** Select the account the user signed in to from this dialog. */
  private onSignInResult = (result: SignInResult) => {
    if (result.kind === 'success' && this.mounted) {
      this.setState({ selectedAccount: result.account })
    }
  }

  private signInDotCom = () => {
    this.props.dispatcher.showDotComSignInDialog(this.onSignInResult)
  }

  private signInEnterprise = () => {
    this.props.dispatcher.showEnterpriseSignInDialog(
      undefined,
      this.onSignInResult
    )
  }

  private publishRepository = async () => {
    const account = this.getSelectedAccount()
    if (account === null) {
      return
    }

    this.setState({ error: null, publishing: true })

    const { settings } = this.state

    try {
      await this.props.dispatcher.publishRepository(
        this.props.repository,
        settings.name,
        settings.description,
        settings.private,
        account,
        settings.org
      )

      this.props.onDismissed()
    } catch (e) {
      this.setState({ error: e, publishing: false })
    }
  }
}
