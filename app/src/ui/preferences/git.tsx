import * as React from 'react'
import { DialogContent } from '../dialog'
import { RefNameTextBox } from '../lib/ref-name-text-box'
import { Ref } from '../lib/ref'
import { LinkButton } from '../lib/link-button'
import { Account, IAccountIdentity } from '../../models/account'
import { GitConfigUserForm } from '../lib/git-config-user-form'
import { TextBox } from '../lib/text-box'
import { IManagedAuthor } from '../../lib/authorship'
import { TabBar } from '../tab-bar'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { Select } from '../lib/select'
import {
  shellFriendlyNames,
  SupportedHooksEnvShell,
} from '../../lib/hooks/config'

interface IGitProps {
  readonly name: string
  readonly email: string
  readonly defaultBranch: string
  readonly isLoadingGitConfig: boolean

  readonly accounts: ReadonlyArray<Account>
  readonly knownAccounts: ReadonlyArray<Account>
  readonly desktopManaged: boolean
  readonly externalManaged: boolean
  readonly managedAuthors: ReadonlyArray<{
    readonly identity: IAccountIdentity
    readonly author: IManagedAuthor
  }>
  readonly authorshipError?: string
  readonly onDesktopManagedChanged: (enabled: boolean) => void
  readonly onExternalManagedChanged: (enabled: boolean) => void
  readonly onManagedAuthorChanged: (
    identity: IAccountIdentity,
    field: 'name' | 'email',
    value: string
  ) => void

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

interface IManagedAuthorFieldsProps {
  readonly account: Account
  readonly author: IManagedAuthor
  readonly onChanged: (
    identity: IAccountIdentity,
    field: 'name' | 'email',
    value: string
  ) => void
}

class ManagedAuthorFields extends React.Component<IManagedAuthorFieldsProps> {
  private onNameChanged = (value: string) =>
    this.props.onChanged(this.identity, 'name', value)

  private onEmailChanged = (value: string) =>
    this.props.onChanged(this.identity, 'email', value)

  private get identity(): IAccountIdentity {
    const { endpoint, id } = this.props.account
    return { endpoint, id }
  }

  public render() {
    const { account, author } = this.props
    return (
      <div>
        <h3>
          {account.friendlyName} ({account.endpoint})
        </h3>
        <TextBox
          label="Name"
          value={author.name}
          onValueChanged={this.onNameChanged}
        />
        <TextBox
          label="Email"
          value={author.email}
          onValueChanged={this.onEmailChanged}
        />
      </div>
    )
  }
}

export class Git extends React.Component<IGitProps> {
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

  private onAuthorshipModeChanged = (
    event: React.FormEvent<HTMLSelectElement>
  ) => {
    this.props.onDesktopManagedChanged(event.currentTarget.value === 'desktop')
  }

  private onExternalManagedChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    this.props.onExternalManagedChanged(event.currentTarget.checked)
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
        <Select
          label="Commit authorship"
          value={this.props.desktopManaged ? 'desktop' : 'git'}
          onChange={this.onAuthorshipModeChanged}
        >
          <option value="git">Let Git manage my author identity</option>
          <option value="desktop">
            Let GitHub Desktop manage my author identity
          </option>
        </Select>
        {this.props.desktopManaged ? (
          <>
            {this.props.knownAccounts.map(account => {
              const identity = { endpoint: account.endpoint, id: account.id }
              const author = this.props.managedAuthors.find(
                item =>
                  item.identity.endpoint === identity.endpoint &&
                  item.identity.id === identity.id
              )?.author
              if (author === undefined) {
                return null
              }
              return (
                <ManagedAuthorFields
                  key={`${account.endpoint}:${account.id}`}
                  account={account}
                  author={author}
                  onChanged={this.props.onManagedAuthorChanged}
                />
              )
            })}
            <Checkbox
              label="Use these identities with external Git"
              value={
                this.props.externalManaged
                  ? CheckboxValue.On
                  : CheckboxValue.Off
              }
              onChange={this.onExternalManagedChanged}
            />
          </>
        ) : (
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
        )}
        {this.props.authorshipError !== undefined && (
          <p role="alert">{this.props.authorshipError}</p>
        )}
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
