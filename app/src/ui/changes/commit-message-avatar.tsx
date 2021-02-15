import React from 'react'
import { Select } from '../lib/select'
import { Button } from '../lib/button'
import { Row } from '../lib/row'
import { Popover, PopoverCaretPosition } from '../lib/popover'
import { IAvatarUser } from '../../models/avatar'
import { Account } from '../../models/account'
import { Avatar } from '../lib/avatar'
import { Octicon, OcticonSymbol } from '../octicons'
import { lookupPreferredEmail } from '../../lib/email'
import { LinkButton } from '../lib/link-button'
import { getDotComAPIEndpoint } from '../../lib/api'
import { Repository } from '../../models/repository'
import { Dispatcher } from '../dispatcher'
import { setGlobalConfigValue } from '../../lib/git'

interface ICommitMessageAvatarState {
  isPopoverOpen: boolean

  /** Currently selected account email address. */
  accountEmail: string
}

interface ICommitMessageAvatarProps {
  /** The user whose avatar should be displayed. */
  readonly user?: IAvatarUser

  /**
   * The title of the avatar.
   * Defaults to the name and email if undefined and is
   * skipped completely if title is null
   */
  readonly title?: string | null

  /** Current email address configured by the user. */
  readonly email?: string

  /** Repository where the user could commit right now. */
  readonly repository: Repository | null

  /**
   * Best GitHub (Enterprise) account match for this repository. Usually, that
   * means the GitHub account for GitHub repositories, the GitHub Enterprise
   * account for GHE repositories, and null for any other git repository.
   */
  readonly repositoryAccount: Account | null

  readonly dispatcher: Dispatcher
}

/**
 * User avatar shown in the commit message area. It encapsulates not only the
 * user avatar, but also any badge and warning we might display to the user.
 */
export class CommitMessageAvatar extends React.Component<
  ICommitMessageAvatarProps,
  ICommitMessageAvatarState
> {
  public constructor(props: ICommitMessageAvatarProps) {
    super(props)

    const account = this.props.repositoryAccount

    this.state = {
      isPopoverOpen: false,
      accountEmail: account !== null ? lookupPreferredEmail(account) : '',
    }
  }

  private shouldShowMisattributedCommitWarning() {
    if (
      this.props.email === undefined ||
      this.props.repositoryAccount === null ||
      this.props.repository === null ||
      this.props.repository.ignoreWrongUserEmail
    ) {
      return false
    }

    const emails = this.props.repositoryAccount.emails.map(e => e.email)
    return emails.includes(this.props.email) === false
  }

  public render() {
    return (
      <div className="commit-message-avatar-component">
        <div onClick={this.onAvatarClick}>
          {this.shouldShowMisattributedCommitWarning() &&
            this.renderMisattributedCommitWarning()}
          <Avatar user={this.props.user} title={this.props.title} />
        </div>
        {this.state.isPopoverOpen && this.renderPopover()}
      </div>
    )
  }

  private renderMisattributedCommitWarning() {
    return (
      <div className="misattributed-commit-warning-badge">
        <Octicon symbol={OcticonSymbol.alert} />
      </div>
    )
  }

  private openPopover = () => {
    this.setState(prevState => {
      if (prevState.isPopoverOpen === false) {
        return { isPopoverOpen: true }
      }
      return null
    })
  }

  private closePopover = () => {
    this.setState(prevState => {
      if (prevState.isPopoverOpen) {
        return { isPopoverOpen: false }
      }
      return null
    })
  }

  private onAvatarClick = (event: React.FormEvent<HTMLDivElement>) => {
    if (this.shouldShowMisattributedCommitWarning() === false) {
      return
    }

    event.preventDefault()
    if (this.state.isPopoverOpen) {
      this.closePopover()
    } else {
      this.openPopover()
    }
  }

  private renderPopover() {
    const account = this.props.repositoryAccount
    if (account === null) {
      return
    }

    const allEmails = account.emails.map(e => e.email)

    const accountTypeSuffix =
      account.endpoint === getDotComAPIEndpoint() ? '' : ' Enterprise'

    return (
      <Popover
        caretPosition={PopoverCaretPosition.LeftTop}
        onClickOutside={this.closePopover}
      >
        <h3>This commit will be misattributed</h3>
        <Row>
          <div>
            The email in your{' '}
            <span className="highlighted-text">git config</span> (
            {this.props.email}) doesn't match your{' '}
            <span className="highlighted-text">
              GitHub{accountTypeSuffix} account
            </span>
            .{' '}
            <LinkButton uri="https://docs.github.com/en/github/committing-changes-to-your-project/why-are-my-commits-linked-to-the-wrong-user">
              Learn more.
            </LinkButton>
          </div>
        </Row>
        <Row>
          <Select
            value={this.state.accountEmail}
            onChange={this.onSelectedGitHubEmailChange}
          >
            {allEmails.map(n => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        </Row>
        <Row className="button-row">
          <Button onClick={this.onIgnoreClick} tooltip="Ignore" type="button">
            Ignore
          </Button>
          <Button onClick={this.onSaveClick} tooltip="Save" type="submit">
            Save
          </Button>
        </Row>
      </Popover>
    )
  }

  private onIgnoreClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    this.closePopover()

    const repository = this.props.repository
    if (repository === null) {
      return
    }

    this.props.dispatcher.updateRepositoryIgnoreWrongUserEmail(repository, true)
  }

  private onSaveClick = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    this.closePopover()

    const repository = this.props.repository
    if (repository === null) {
      return
    }

    if (this.props.email !== this.state.accountEmail) {
      await setGlobalConfigValue('user.email', this.state.accountEmail)
      this.props.dispatcher.refreshAuthor(repository)
    }
  }

  private onSelectedGitHubEmailChange = (
    event: React.FormEvent<HTMLSelectElement>
  ) => {
    const email = event.currentTarget.value
    if (email) {
      this.setState({ accountEmail: email })
    }
  }
}
