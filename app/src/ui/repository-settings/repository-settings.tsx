import * as React from 'react'
import * as Path from 'path'
import * as Fs from 'fs'
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
import { Dialog, DialogError, DialogFooter } from '../dialog'

interface IRepositorySettingsProps {
  readonly dispatcher: Dispatcher
  readonly remote: IRemote | null
  readonly repository: Repository
  readonly onDismissed: () => void
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
  readonly ignoreTextHasChanged: boolean
  readonly disabled: boolean
  readonly errors?: ReadonlyArray<JSX.Element | string>
}

export class RepositorySettings extends React.Component<IRepositorySettingsProps, IRepositorySettingsState> {
  public constructor(props: IRepositorySettingsProps) {
    super(props)

    this.state = {
      selectedTab: RepositorySettingsTab.Remote,
      remote: props.remote,
      ignoreText: null,
      ignoreTextHasChanged: false,
      disabled: false,
    }
  }

  public componentWillMount() {
    const repository = this.props.repository
    const ignorePath = Path.join(repository.path, '.gitignore')

    Fs.readFile(ignorePath, 'utf8', (err, data) => {
      if (err) {
        // TODO: what if this is a real error and we can't read the file?
      } else {
        // ensure we assign something to the current text
        this.setState({ ignoreText: data })
      }
    })
  }

  private renderErrors(): JSX.Element[] | null {
    const errors = this.state.errors

    if (!errors || !errors.length) {
      return null
    }

    return errors.map((err, ix) => {
      const key = `err-${ix}`
      return <DialogError key={key}>{err}</DialogError>
    })
  }

  public render() {
    return (
      <Dialog
        id='repository-settings'
        title={__DARWIN__ ? 'Repository Settings' : 'Repository settings'}
        onDismissed={this.props.onDismissed}
        onSubmit={this.onSubmit}
        disabled={this.state.disabled}
      >
        {this.renderErrors()}

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
          onShowExamples={this.onShowGitIgnoreExamples}
        />
      }
      case RepositorySettingsTab.GitLFS: {
        return <GitLFS/>
      }
    }

    return assertNever(tab, `Unknown tab type: ${tab}`)
  }

  private onShowGitIgnoreExamples = () => {
    this.props.dispatcher.openInBrowser('https://git-scm.com/docs/gitignore')
  }

  private onSubmit = async () => {

    this.setState({ disabled: true, errors: undefined })
    const errors = new Array<JSX.Element | string>()

    if (this.state.remote && this.props.remote) {
      if (this.state.remote.url !== this.props.remote.url) {
        try {
          await this.props.dispatcher.setRemoteURL(
            this.props.repository,
            this.props.remote.name,
            this.state.remote.url
          )
        } catch (e) {
          errors.push(`Failed saving the remote URL: ${e}`)
        }
      }
    }

    if (this.state.ignoreTextHasChanged && this.state.ignoreText !== null) {
      try {
        await this.saveGitIgnore()
      } catch (e) {
        errors.push(`Failed saving the .gitignore file: ${e}`)
      }
    }

    if (!errors.length) {
      this.props.onDismissed()
    } else {
      this.setState({ disabled: false, errors })
    }
  }

  private async saveGitIgnore(): Promise<void> {
    const repository = this.props.repository
    const ignorePath = Path.join(repository.path, '.gitignore')
    const fileContents = ensureTrailingNewline(this.state.ignoreText || '')

    return new Promise<void>((resolve, reject) => {
      Fs.writeFile(ignorePath, fileContents, err => {
        if (err) {
          reject(err)
        } else {
          resolve()
        }
      })
    })
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
    this.setState({ ignoreText: text, ignoreTextHasChanged: true })
  }

  private onTabClicked = (index: number) => {
    this.setState({ selectedTab: index })
  }
}

function ensureTrailingNewline(text: string): string {
  // mixed line endings might be an issue here
  if (!text.endsWith('\n')) {
    const linesEndInCRLF = text.indexOf('\r\n')
    return linesEndInCRLF === -1
      ? `${text}\n`
      : `${text}\r\n`
  } else {
    return text
  }
}
