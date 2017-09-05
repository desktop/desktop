import * as React from 'react'

import { Account } from '../../models/account'
import { DialogContent } from '../dialog'
import { TextBox } from '../lib/text-box'
import { Row } from '../lib/row'
import { Button } from '../lib/button'
import { Loading } from '../lib/loading'
import { Octicon } from '../octicons'
import { FilterList } from '../lib/filter-list'
import { API } from '../../lib/api'
import { IFilterListGroup } from '../lib/filter-list'
import {
  IClonableRepositoryListItem,
  groupRepositories,
} from './group-repositories'

interface ICloneGithubRepositoryProps {
  /** The account to clone from. */
  readonly account: Account

  /** The path to clone to. */
  readonly path: string

  /** Called when the destination path changes. */
  readonly onPathChanged: (path: string) => void

  /** Called when the dialog should be dismissed. */
  readonly onDismissed: () => void

  /**
   * Called when the user should be prompted to choose a destination directory.
   */
  readonly onChooseDirectory: () => Promise<string | undefined>

  /** Called when a repository is selected. */
  readonly onGitHubRepositorySelected: (url: string) => void
}

interface ICloneGithubRepositoryState {
  /** Are we currently loading the repositories list? */
  readonly loading: boolean

  /** The list of clonable repositories. */
  readonly repositories: ReadonlyArray<
    IFilterListGroup<IClonableRepositoryListItem>
  >

  /** The currently selected item. */
  readonly selectedItem: IClonableRepositoryListItem | null
}

const ClonableRepositoryFilterList: new () => FilterList<
  IClonableRepositoryListItem
> = FilterList as any
const RowHeight = 31

export class CloneGithubRepository extends React.Component<
  ICloneGithubRepositoryProps,
  ICloneGithubRepositoryState
> {
  public constructor(props: ICloneGithubRepositoryProps) {
    super(props)

    this.state = {
      loading: false,
      repositories: [],
      selectedItem: null,
    }
  }

  public async componentDidMount() {
    this.setState({
      loading: true,
    })

    const api = API.fromAccount(this.props.account)
    const result = await api.fetchRepositories()

    const repositories = result
      ? groupRepositories(result, this.props.account.login)
      : []

    this.setState({
      repositories,
      loading: false,
    })
  }

  public render() {
    return (
      <DialogContent className="clone-github-repository-content">
        <Row>{this.renderRepositoryList()}</Row>

        <Row className="local-path-field">
          <TextBox
            value={this.props.path}
            label={__DARWIN__ ? 'Local Path' : 'Local path'}
            placeholder="repository path"
            onValueChanged={this.onPathChanged}
          />
          <Button onClick={this.onChooseDirectory}>Choose…</Button>
        </Row>
      </DialogContent>
    )
  }

  private renderRepositoryList() {
    if (this.state.loading) {
      return (
        <div className="clone-github-repo clone-loading">
          <Loading /> Loading repositories…
        </div>
      )
    }

    return (
      <ClonableRepositoryFilterList
        className="clone-github-repo"
        rowHeight={RowHeight}
        selectedItem={this.state.selectedItem}
        renderItem={this.renderItem}
        renderGroupHeader={this.renderGroupHeader}
        onItemClick={this.onItemClicked}
        onFilterKeyDown={this.onFilterKeyDown}
        invalidationProps={this.state.repositories}
        groups={this.state.repositories}
      />
    )
  }

  private onFilterKeyDown = (
    filter: string,
    event: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (event.key === 'Escape') {
      if (filter.length === 0) {
        this.props.onDismissed()
        event.preventDefault()
      }
    }
  }

  private onItemClicked = (item: IClonableRepositoryListItem) => {
    this.setState({ selectedItem: item })
    this.props.onGitHubRepositorySelected(item.url)
  }

  private onChooseDirectory = async () => {
    const path = await this.props.onChooseDirectory()

    if (path) {
      this.props.onPathChanged(path)
    }
  }

  private onPathChanged = (path: string) => {
    this.props.onPathChanged(path)
  }

  private renderGroupHeader = (header: string) => {
    return (
      <div className="clone-repository-list-content clone-repository-list-group-header">
        {header}
      </div>
    )
  }

  private renderItem = (item: IClonableRepositoryListItem) => {
    return (
      <div className="clone-repository-list-item">
        <Octicon className="icon" symbol={item.icon} />
        <div className="name" title={name}>
          {item.text}
        </div>
      </div>
    )
  }
}
