import React from 'react'
import { Select } from '../lib/select'
import { Button } from '../lib/button'
import { Row } from '../lib/row'
import {
  Popover,
  PopoverAnchorPosition,
  PopoverDecoration,
} from '../lib/popover'
import { IAvatarUser } from '../../models/avatar'
import { Avatar } from '../lib/avatar'
import { Octicon } from '../octicons'
import * as OcticonSymbol from '../octicons/octicons.generated'
import { LinkButton } from '../lib/link-button'
import { OkCancelButtonGroup } from '../dialog'
import { getConfigValue } from '../../lib/git/config'
import { Repository } from '../../models/repository'
import classNames from 'classnames'

interface ICommitMessageAvatarState {
  readonly isPopoverOpen: boolean

  /** Currently selected account email address. */
  readonly accountEmail: string

  /** Whether the git configuration is local to the repository or global  */
  readonly isGitConfigLocal: boolean
}

interface ICommitMessageAvatarProps {
  /** The user whose avatar should be displayed. */
  readonly user?: IAvatarUser

  /** Current email address configured by the user. */
  readonly email?: string

  /** Whether or not the warning badge on the avatar should be visible. */
  readonly warningBadgeVisible: boolean

  /** Whether or not the user's account is a GHE account. */
  readonly isEnterpriseAccount: boolean

  /** Email addresses available in the relevant GitHub (Enterprise) account. */
  readonly accountEmails: ReadonlyArray<string>

  /** Preferred email address from the user's account. */
  readonly preferredAccountEmail: string

  /**
   * The currently selected repository
   */
  readonly repository: Repository

  readonly onUpdateEmail: (email: string) => void

  /**
   * Called when the user has requested to see the Git Config tab in the
   * repository settings dialog
   */
  readonly onOpenRepositorySettings: () => void

  /**
   * Called when the user has requested to see the Git tab in the user settings
   * dialog
   */
  readonly onOpenGitSettings: () => void
}

/**
 * User avatar shown in the commit message area. It encapsulates not only the
 * user avatar, but also any badge and warning we might display to the user.
 */
export class CommitMessageAvatar extends React.Component<
  ICommitMessageAvatarProps,
  ICommitMessageAvatarState
> {
  private avatarButtonRef: HTMLButtonElement | null = null
  private warningBadgeRef = React.createRef<HTMLDivElement>()

  public constructor(props: ICommitMessageAvatarProps) {
    super(props)

    this.state = {
      isPopoverOpen: false,
      accountEmail: this.props.preferredAccountEmail,
      isGitConfigLocal: false,
    }
    this.determineGitConfigLocation()
  }

  public componentDidUpdate(prevProps: ICommitMessageAvatarProps) {
    if (
      this.props.user?.name !== prevProps.user?.name ||
      this.props.user?.email !== prevProps.user?.email
    ) {
      this.determineGitConfigLocation()
    }
  }

  private async determineGitConfigLocation() {
    const isGitConfigLocal = await this.isGitConfigLocal()
    this.setState({ isGitConfigLocal })
  }

  private isGitConfigLocal = async () => {
    const { repository } = this.props
    const localName = await getConfigValue(repository, 'user.name', true)
    const localEmail = await getConfigValue(repository, 'user.email', true)
    return localName !== null || localEmail !== null
  }

  private onButtonRef = (buttonRef: HTMLButtonElement | null) => {
    this.avatarButtonRef = buttonRef
  }

  public render() {
    const { warningBadgeVisible, user } = this.props

    const ariaLabel = warningBadgeVisible
      ? 'Commit may be misattributed. View warning.'
      : 'View commit author information'

    const classes = classNames('commit-message-avatar-component', {
      misattributed: warningBadgeVisible,
    })

    return (
      <div className={classes}>
        <Button
          className="avatar-button"
          ariaLabel={ariaLabel}
          onButtonRef={this.onButtonRef}
          onClick={this.onAvatarClick}
        >
          {warningBadgeVisible && this.renderWarningBadge()}
          <Avatar user={user} title={null} />
        </Button>
        {this.state.isPopoverOpen && this.renderPopover()}
      </div>
    )
  }

  private renderWarningBadge() {
    return (
      <div className="warning-badge" ref={this.warningBadgeRef}>
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

  private onAvatarClick = (event: React.FormEvent<HTMLButtonElement>) => {
    event.preventDefault()
    if (this.state.isPopoverOpen) {
      this.closePopover()
    } else {
      this.openPopover()
    }
  }

  private renderGitConfigPopover() {
    const { user } = this.props
    const { isGitConfigLocal } = this.state

    const location = isGitConfigLocal ? 'local' : 'global'
    const locationDesc = isGitConfigLocal ? 'for your repository' : ''
    const settingsName = __DARWIN__ ? 'settings' : 'options'
    const settings = isGitConfigLocal
      ? 'repository settings'
      : `git ${settingsName}`
    const buttonText = __DARWIN__ ? 'Open Git Settings' : 'Open git settings'

    return (
      <>
        <p>{user && user.name && `Email: ${user.email}`}</p>

        <p>
          You can update your {location} git configuration {locationDesc} in
          your {settings}.
        </p>

        {!isGitConfigLocal && (
          <p className="secondary-text">
            You can also set an email local to this repository from the{' '}
            <LinkButton onClick={this.onRepositorySettingsClick}>
              repository settings
            </LinkButton>
            .
          </p>
        )}
        <Row className="button-row">
          <OkCancelButtonGroup
            okButtonText={buttonText}
            onOkButtonClick={this.onOpenGitSettings}
            onCancelButtonClick={this.onIgnoreClick}
          />
        </Row>
      </>
    )
  }

  private renderMisattributedCommitPopover() {
    const accountTypeSuffix = this.props.isEnterpriseAccount
      ? ' Enterprise'
      : ''

    const updateEmailTitle = __DARWIN__ ? 'Update Email' : 'Update email'

    const userName =
      this.props.user && this.props.user.name
        ? ` for ${this.props.user.name}`
        : ''

    return (
      <>
        <Row>
          <div>
            The email in your global Git config (
            <span className="git-email">{this.props.email}</span>) doesn't match
            your GitHub{accountTypeSuffix} account{userName}.{' '}
            <LinkButton
              ariaLabel="Learn more about commit attribution"
              uri="https://docs.github.com/en/github/committing-changes-to-your-project/why-are-my-commits-linked-to-the-wrong-user"
            >
              Learn more
            </LinkButton>
          </div>
        </Row>
        <Row>
          <Select
            label="Your Account Emails"
            value={this.state.accountEmail}
            onChange={this.onSelectedGitHubEmailChange}
          >
            {this.props.accountEmails.map(n => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        </Row>
        <Row>
          <div className="secondary-text">
            You can also choose an email local to this repository from the{' '}
            <LinkButton onClick={this.onRepositorySettingsClick}>
              repository settings
            </LinkButton>
            .
          </div>
        </Row>
        <Row className="button-row">
          <Button onClick={this.onIgnoreClick} type="button">
            Ignore
          </Button>
          <Button onClick={this.onUpdateEmailClick} type="submit">
            {updateEmailTitle}
          </Button>
        </Row>
      </>
    )
  }

  private getCommittingAsTitle(): string | JSX.Element | undefined {
    const { user } = this.props

    if (user === undefined) {
      return 'Unknown user'
    }

    const { name, email } = user

    if (name) {
      return (
        <>
          Committing as <strong>{name}</strong>
        </>
      )
    }

    return <>Committing with {email}</>
  }

  private renderPopover() {
    const { warningBadgeVisible } = this.props

    return (
      <Popover
        anchor={
          warningBadgeVisible
            ? this.warningBadgeRef.current
            : this.avatarButtonRef
        }
        anchorPosition={PopoverAnchorPosition.RightBottom}
        decoration={PopoverDecoration.Balloon}
        onClickOutside={this.closePopover}
        ariaLabelledby="commit-avatar-popover-header"
      >
        <h3 id="commit-avatar-popover-header">
          {warningBadgeVisible
            ? 'This commit will be misattributed'
            : this.getCommittingAsTitle()}
        </h3>

        {warningBadgeVisible
          ? this.renderMisattributedCommitPopover()
          : this.renderGitConfigPopover()}
      </Popover>
    )
  }

  private onRepositorySettingsClick = () => {
    this.closePopover()
    this.props.onOpenRepositorySettings()
  }

  private onOpenGitSettings = () => {
    this.closePopover()
    if (this.state.isGitConfigLocal) {
      this.props.onOpenRepositorySettings()
    } else {
      this.props.onOpenGitSettings()
    }
  }

  private onIgnoreClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    this.closePopover()
  }

  private onUpdateEmailClick = async (
    event: React.MouseEvent<HTMLButtonElement>
  ) => {
    event.preventDefault()
    this.closePopover()

    if (this.props.email !== this.state.accountEmail) {
      this.props.onUpdateEmail(this.state.accountEmail)
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
