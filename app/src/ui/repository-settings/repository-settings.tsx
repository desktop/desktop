import * as React from 'react'
import { TabBar } from '../tab-bar'
import { Remote } from './remote'
import { GitIgnore } from './git-ignore'
import { GitLFS } from './git-lfs'
import { assertNever } from '../../lib/fatal-error'
import { IRemote } from '../../models/remote'
import { Dispatcher } from '../../lib/dispatcher'
import { Repository } from '../../models/repository'
import { Button } from '../lib/button'
import { ButtonGroup } from '../lib/button-group'
import { Dialog, DialogFooter } from '../dialog'

interface IRepositorySettingsProps {
  readonly dispatcher: Dispatcher
  readonly remote: IRemote | null
  readonly repository: Repository
  readonly onDismissed: () => void
  readonly gitIgnoreText: string | null
}

enum RepositorySettingsTab {
  Remote = 0,
  IgnoredFiles,
  GitLFS,
}

interface IRepositorySettingsState {
  readonly selectedTab: RepositorySettingsTab
  readonly remote: IRemote | null
  readonly ignoreText: string | null
}

export class RepositorySettings extends React.Component<IRepositorySettingsProps, IRepositorySettingsState> {
  public constructor(props: IRepositorySettingsProps) {
    super(props)

    this.state = {
      selectedTab: RepositorySettingsTab.Remote,
      remote: props.remote,
      ignoreText: this.props.gitIgnoreText,
    }
  }

  public render() {
    return (
      <Dialog
        id='repository-settings'
        title={__DARWIN__ ? 'Repository Settings' : 'Repository settings'}
        onDismissed={this.props.onDismissed}
        onSubmit={this.onSubmit}
      >
        <TabBar onTabClicked={this.onTabClicked} selectedIndex={this.state.selectedTab}>
          <span>Remote</span>
          <span>Ignored Files</span>
          <span>Git LFS</span>
        </TabBar>
        {this.renderActiveTab()}
        <DialogFooter>
          <ButtonGroup>
            <Button type='submit'>Save</Button>
            <Button onClick={this.props.onDismissed}>Cancel</Button>
          </ButtonGroup>
        </DialogFooter>
      </Dialog>
    )
  }

  private renderActiveTab() {
    const tab = this.state.selectedTab
    switch (tab) {
      case RepositorySettingsTab.Remote: {
        return (
          <Remote
            remote={this.state.remote}
            onRemoteUrlChanged={this.onRemoteUrlChanged}
          />
        )
      }
      case RepositorySettingsTab.IgnoredFiles: {
        return <GitIgnore
          text={this.state.ignoreText}
          onIgnoreTextChanged={this.onIgnoreTextChanged}
        />
      }
      case RepositorySettingsTab.GitLFS: {
        return <GitLFS/>
      }
    }

    return assertNever(tab, `Unknown tab type: ${tab}`)
  }

  private onSubmit = () => {
    if (this.state.remote && this.props.remote) {
      if (this.state.remote.url !== this.props.remote.url) {
        this.props.dispatcher.setRemoteURL(
          this.props.repository,
          this.props.remote.name,
          this.state.remote.url
        )
      }
    }

    if (this.state.ignoreText && this.state.ignoreText !== this.props.gitIgnoreText) {
      this.props.dispatcher.setGitIgnoreText(this.props.repository, this.state.ignoreText)
    }

    this.props.onDismissed()
  }

  private onRemoteUrlChanged = (url: string) => {

    const remote = this.props.remote

    if (!remote) {
      return
    }

    const newRemote = { ...remote, url }
    this.setState({ remote: newRemote })
  }

  private onIgnoreTextChanged = (text: string) => {
    this.setState({ ignoreText: text })
  }

  private onTabClicked = (index: number) => {
    this.setState({ selectedTab: index })
  }
}
