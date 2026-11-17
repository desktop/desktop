import * as React from 'react'
import { DialogContent } from '../dialog'
import { RefNameTextBox } from '../lib/ref-name-text-box'
import { Ref } from '../lib/ref'
import { LinkButton } from '../lib/link-button'
import {
  Account,
  getAccountKey,
  getFriendlyEndpoint,
  isSameAccount,
} from '../../models/account'
import {
  CommitIdentityMode,
  getManagedCommitEmailError,
  getManagedCommitNameError,
  ICommitIdentityEdit,
  IManagedCommitIdentity,
} from '../../lib/managed-commit-identity'
import classNames from 'classnames'
import { Button } from '../lib/button'
import { TooltippedContent } from '../lib/tooltipped-content'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { InputError } from '../lib/input-description/input-error'
import { Caption } from '../lib/input-description/input-caption'
import { RadioGroup } from '../lib/radio-group'
import { TextBox } from '../lib/text-box'
import { GitConfigUserForm } from '../lib/git-config-user-form'
import { TabBar } from '../tab-bar'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { Select } from '../lib/select'
import {
  shellFriendlyNames,
  SupportedHooksEnvShell,
} from '../../lib/hooks/config'

interface IGitProps {
  readonly commitIdentityMode: CommitIdentityMode
  readonly managedIdentities: ReadonlyArray<IManagedCommitIdentity>
  readonly onCommitIdentityModeChanged: (mode: CommitIdentityMode) => void
  readonly onManagedIdentityChanged: (edit: ICommitIdentityEdit) => void
  readonly name: string
  readonly email: string
  readonly defaultBranch: string
  readonly isLoadingGitConfig: boolean

  readonly accounts: ReadonlyArray<Account>

  readonly onNameChanged: (name: string) => void
  readonly onEmailChanged: (email: string) => void
  readonly onDefaultBranchChanged: (defaultBranch: string) => void

  readonly onEditGlobalGitConfig: () => void

  readonly selectedTabIndex?: number
  readonly onSelectedTabIndexChanged: (index: number) => void

  readonly onEnableGitHookEnvChanged: (enableGitHookEnv: boolean) => void
  readonly onCacheGitHookEnvChanged: (cacheGitHookEnv: boolean) => void
  readonly onSelectedShellChanged: (selectedShell: string) => void

  readonly enableGitHookEnv: boolean
  readonly cacheGitHookEnv: boolean
  readonly selectedShell: string
}

const windowsShells: ReadonlyArray<SupportedHooksEnvShell> = [
  'git-bash',
  'pwsh',
  'powershell',
  'cmd',
]

interface IGitState {
  /** The account key of the single identity row being edited, if any. */
  readonly expandedIdentityKey: string | null
}

export class Git extends React.Component<IGitProps, IGitState> {
  public constructor(props: IGitProps) {
    super(props)
    this.state = { expandedIdentityKey: null }
  }

  private get selectedTabIndex() {
    return this.props.selectedTabIndex ?? 0
  }

  private onTabClicked = (index: number) => {
    this.props.onSelectedTabIndexChanged?.(index)
  }

  private onEnableGitHookEnvChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    this.props.onEnableGitHookEnvChanged(event.currentTarget.checked)
  }

  private onCacheGitHookEnvChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    this.props.onCacheGitHookEnvChanged(event.currentTarget.checked)
  }

  private onSelectedShellChanged = (
    event: React.FormEvent<HTMLSelectElement>
  ) => {
    this.props.onSelectedShellChanged(event.currentTarget.value)
  }

  private renderHooksSettings() {
    return (
      <>
        <Checkbox
          label="Load Git hook environment variables from shell"
          ariaDescribedBy="git-hooks-env-description"
          value={
            this.props.enableGitHookEnv ? CheckboxValue.On : CheckboxValue.Off
          }
          onChange={this.onEnableGitHookEnvChanged}
        />
        <p id="git-hooks-env-description" className="settings-description">
          When enabled, GitHub Desktop will attempt to load environment
          variables from your shell when executing Git hooks. This is useful if
          your Git hooks depend on environment variables set in your shell
          configuration files, a common practice for version managers such as
          nvm, rbenv, asdf, etc.
        </p>

        {this.props.enableGitHookEnv && __WIN32__ && (
          <>
            <Select
              className="git-hook-shell-select"
              label={'Shell to use when loading environment'}
              value={this.props.selectedShell}
              onChange={this.onSelectedShellChanged}
            >
              {windowsShells
                .map(s => ({ key: s, title: shellFriendlyNames[s] }))
                .map(s => (
                  <option key={s.key} value={s.key}>
                    {s.title}
                  </option>
                ))}
            </Select>
          </>
        )}

        {this.props.enableGitHookEnv && (
          <>
            <Checkbox
              label="Cache Git hook environment variables"
              ariaDescribedBy="git-hooks-cache-description"
              onChange={this.onCacheGitHookEnvChanged}
              value={
                this.props.cacheGitHookEnv
                  ? CheckboxValue.On
                  : CheckboxValue.Off
              }
            />

            <div
              id="git-hooks-cache-description"
              className="settings-description"
            >
              Cache hook environment variables to improve performance. Disable
              if your hooks rely on frequently changing environment variables.
            </div>
          </>
        )}
      </>
    )
  }

  public render() {
    return (
      <DialogContent className="git-preferences">
        <TabBar
          selectedIndex={this.selectedTabIndex}
          onTabClicked={this.onTabClicked}
        >
          <span>Author</span>
          <span>Default branch</span>
          <span>Hooks</span>
        </TabBar>
        <div className="git-preferences-content">{this.renderCurrentTab()}</div>
      </DialogContent>
    )
  }

  private renderCurrentTab() {
    if (this.selectedTabIndex === 0) {
      return this.renderGitConfigAuthorInfo()
    } else if (this.selectedTabIndex === 1) {
      return this.renderDefaultBranchSetting()
    } else if (this.selectedTabIndex === 2) {
      return this.renderHooksSettings()
    }

    return null
  }

  private renderGitConfigAuthorInfo() {
    return (
      <>
        <h2 id="commit-identity-management">Commit identity</h2>
        <RadioGroup<CommitIdentityMode>
          ariaLabelledBy="commit-identity-management"
          selectedKey={this.props.commitIdentityMode}
          radioButtonKeys={['git', 'desktop']}
          onSelectionChanged={this.props.onCommitIdentityModeChanged}
          renderRadioButtonLabelContents={this.renderIdentityModeLabel}
        />
        {this.props.commitIdentityMode === 'desktop'
          ? this.renderManagedIdentities()
          : this.renderGitIdentity()}
      </>
    )
  }

  private renderIdentityModeLabel = (mode: CommitIdentityMode) =>
    mode === 'git' ? 'Git will manage' : 'GitHub Desktop will manage'

  private renderManagedIdentities() {
    return (
      <>
        <p className="settings-description">
          Account identities apply only to associated repositories and
          operations in GitHub Desktop. Unassociated repositories and external
          applications continue using their Git configuration.
        </p>
        {this.props.managedIdentities.length === 0 ? (
          <p>Sign in to an account to configure its commit identity.</p>
        ) : (
          <ul
            className="managed-identity-list"
            aria-labelledby="commit-identity-management"
          >
            {this.props.managedIdentities.map((identity, index) => {
              const key = getAccountKey(identity)
              return (
                <ManagedIdentityRow
                  key={key}
                  id={`managed-identity-${index}`}
                  identity={identity}
                  signedOut={
                    !this.props.accounts.some(a => isSameAccount(a, identity))
                  }
                  expanded={this.state.expandedIdentityKey === key}
                  onToggleExpanded={this.onToggleIdentityExpanded}
                  onChanged={this.props.onManagedIdentityChanged}
                />
              )
            })}
          </ul>
        )}
      </>
    )
  }

  private onToggleIdentityExpanded = (identity: IManagedCommitIdentity) => {
    const key = getAccountKey(identity)
    this.setState(state => ({
      expandedIdentityKey: state.expandedIdentityKey === key ? null : key,
    }))
  }

  private renderGitIdentity() {
    return (
      <>
        <GitConfigUserForm
          email={this.props.email}
          name={this.props.name}
          isLoadingGitConfig={this.props.isLoadingGitConfig}
          accounts={this.props.accounts}
          onEmailChanged={this.props.onEmailChanged}
          onNameChanged={this.props.onNameChanged}
        />
        {this.renderEditGlobalGitConfigInfo()}
      </>
    )
  }

  private renderDefaultBranchSetting() {
    return (
      <div className="default-branch-component">
        <h2 id="default-branch-heading">
          Default branch name for new repositories
        </h2>

        <RefNameTextBox
          initialValue={this.props.defaultBranch}
          onValueChange={this.props.onDefaultBranchChanged}
          ariaLabelledBy={'default-branch-heading'}
          ariaDescribedBy="default-branch-description"
          warningMessageVerb="saved"
        />

        <p id="default-branch-description" className="settings-description">
          GitHub's default branch name is <Ref>main</Ref>. You may want to
          change it due to different workflows, or because your integrations
          still require the historical default branch name of <Ref>master</Ref>.
        </p>

        {this.renderEditGlobalGitConfigInfo()}
      </div>
    )
  }

  private renderEditGlobalGitConfigInfo() {
    return (
      <p className="settings-description">
        These preferences will{' '}
        <LinkButton onClick={this.props.onEditGlobalGitConfig}>
          edit your global Git config file
        </LinkButton>
        .
      </p>
    )
  }
}

interface IManagedIdentityRowProps {
  readonly id: string
  readonly identity: IManagedCommitIdentity
  readonly signedOut: boolean
  readonly expanded: boolean
  readonly onToggleExpanded: (identity: IManagedCommitIdentity) => void
  readonly onChanged: (edit: ICommitIdentityEdit) => void
}

function ManagedIdentityRow({
  id,
  identity,
  signedOut,
  expanded,
  onToggleExpanded,
  onChanged,
}: IManagedIdentityRowProps) {
  const { endpoint, login, name, email } = identity
  const host = getFriendlyEndpoint(endpoint)
  const nameError = getManagedCommitNameError(name)
  const emailError = getManagedCommitEmailError(email)
  const invalid = nameError !== undefined || emailError !== undefined
  const editorId = `${id}-editor`
  const accountId = `${id}-account`

  const onNameChanged = React.useCallback(
    (name: string) => onChanged({ endpoint, login, name }),
    [endpoint, login, onChanged]
  )
  const onEmailChanged = React.useCallback(
    (email: string) => onChanged({ endpoint, login, email }),
    [endpoint, login, onChanged]
  )
  const onToggle = React.useCallback(
    () => onToggleExpanded(identity),
    [identity, onToggleExpanded]
  )

  return (
    <li
      className={classNames('managed-identity', {
        expanded,
        invalid: invalid && !expanded,
      })}
    >
      <div className="managed-identity-summary">
        <div className="managed-identity-details">
          <div className="managed-identity-primary">
            <TooltippedContent
              tagName="span"
              className={classNames('managed-identity-name', {
                missing: name.trim().length === 0,
              })}
              tooltip={name}
              onlyWhenOverflowed={true}
            >
              {name.trim().length > 0 ? name : 'No name'}
            </TooltippedContent>
            <TooltippedContent
              tagName="span"
              className={classNames('managed-identity-email', {
                missing: email.trim().length === 0,
              })}
              tooltip={email}
              onlyWhenOverflowed={true}
            >
              {email.trim().length > 0 ? email : 'No email'}
            </TooltippedContent>
          </div>
          <div className="managed-identity-account" id={accountId}>
            <span className="managed-identity-login">@{login}</span>
            <span className="managed-identity-host">{host}</span>
            {signedOut && (
              <span className="managed-identity-signed-out">Signed out</span>
            )}
          </div>
          {invalid && !expanded && (
            <div className="managed-identity-attention">
              <Octicon symbol={octicons.stop} />
              Needs a valid name and email
            </div>
          )}
        </div>
        <Button
          size="small"
          onClick={onToggle}
          ariaExpanded={expanded}
          ariaControls={expanded ? editorId : undefined}
          ariaLabel={`${
            expanded ? 'Done editing' : 'Edit'
          } @${login} on ${host}`}
        >
          {expanded ? 'Done' : 'Edit'}
        </Button>
      </div>
      {expanded && (
        <div
          id={editorId}
          className="managed-identity-editor"
          role="group"
          aria-labelledby={accountId}
        >
          <ManagedIdentityField
            id={`${id}-name`}
            label="Name"
            value={name}
            overridden={identity.nameOverridden}
            error={nameError}
            autoFocus={true}
            onValueChanged={onNameChanged}
          />
          <ManagedIdentityField
            id={`${id}-email`}
            label="Email"
            value={email}
            overridden={identity.emailOverridden}
            error={emailError}
            autoFocus={false}
            onValueChanged={onEmailChanged}
          />
        </div>
      )}
    </li>
  )
}

interface IManagedIdentityFieldProps {
  readonly id: string
  readonly label: string
  readonly value: string
  readonly overridden: boolean
  readonly error: string | undefined
  readonly autoFocus: boolean
  readonly onValueChanged: (value: string) => void
}

function ManagedIdentityField({
  id,
  label,
  value,
  overridden,
  error,
  autoFocus,
  onValueChanged,
}: IManagedIdentityFieldProps) {
  const descriptionId = `${id}-description`
  return (
    <div className="managed-identity-field">
      <TextBox
        label={label}
        value={value}
        required={true}
        autoFocus={autoFocus}
        ariaDescribedBy={descriptionId}
        onValueChanged={onValueChanged}
      />
      {error !== undefined ? (
        <InputError
          id={descriptionId}
          trackedUserInput={value}
          ariaLiveMessage={error}
        >
          {error}
        </InputError>
      ) : (
        <Caption id={descriptionId}>
          {overridden ? 'Custom' : 'From your profile'}
        </Caption>
      )}
    </div>
  )
}
