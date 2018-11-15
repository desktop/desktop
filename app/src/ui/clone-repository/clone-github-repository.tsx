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
import { IMatches } from '../../lib/fuzzy-find'
import {
  IClonableRepositoryListItem,
  groupRepositories,
  YourRepositoriesIdentifier,
} from './group-repositories'
import { HighlightText } from '../lib/highlight-text'

interface ICloneGithubRepositoryProps {
  /** The account to clone from. */
  readonly account: Account

  /** The path to clone to. */
  readonly path: string

  /** Called when the destination path changes. */
  readonly onPathChanged: (path: string) => void

  /**
   * Called when the user should be prompted to choose a destination directory.
   */
  readonly onChooseDirectory: () => Promise<string | undefined>

  /** Called when a repository is selected. */
  readonly onGitHubRepositorySelected: (url: string) => void

  /** Should the component clear the filter text on render? */
  readonly shouldClearFilter: boolean
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

  /** The currently entered filter text. */
  readonly filterText: string
}

const ClonableRepositoryFilterList: new () => FilterList<
  IClonableRepositoryListItem
> = FilterList as any
const RowHeight = 31

export class CloneGithubRepository extends React.Component<
  ICloneGithubRepositoryProps,
  ICloneGithubRepositoryState
> {
  private mounted = false

  public constructor(props: ICloneGithubRepositoryProps) {
    super(props)

    this.state = {
      loading: false,
      repositories: [],
      selectedItem: null,
      filterText: '',
    }
  }

  public componentDidMount() {
    this.mounted = true

    this.loadRepositories(this.props.account)
  }

  public componentWillUnmount() {
    this.mounted = false
  }

  private async loadRepositories(account: Account) {
    this.setState({
      loading: true,
    })

    const api = API.fromAccount(account)
    const result = await api.fetchRepositories()

    // The account could have changed while we were working. Bail if it did.
    if (account.id !== this.props.account.id) {
      return
    }

    if (!this.mounted) {
      return
    }

    const repositories = result
      ? groupRepositories(result, this.props.account.login)
      : []

    this.setState({
      repositories,
      loading: false,
    })
  }

  public componentWillReceiveProps(nextProps: ICloneGithubRepositoryProps) {
    if (nextProps.shouldClearFilter) {
      this.setState({
        filterText: '',
      })
    }

    if (nextProps.account.id !== this.props.account.id) {
      this.loadRepositories(nextProps.account)
    }
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
        onSelectionChanged={this.onSelectionChanged}
        invalidationProps={this.state.repositories}
        groups={this.state.repositories}
        filterText={this.state.filterText}
        onFilterTextChanged={this.onFilterTextChanged}
        renderNoItems={this.noMatchingRepositories}
      />
    )
  }

  private noMatchingRepositories = function() {
    return (
      <div className="no-results-found">
        Sorry, I can't find that repository.
      </div>
    )
  }

  private onFilterTextChanged = (filterText: string) => {
    this.setState({ filterText })
  }

  private onSelectionChanged = (item: IClonableRepositoryListItem | null) => {
    this.setState({ selectedItem: item })
    this.props.onGitHubRepositorySelected(item != null ? item.url : '')
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

  private renderGroupHeader = (identifier: string) => {
    let header = identifier
    if (identifier === YourRepositoriesIdentifier) {
      header = __DARWIN__ ? 'Your Repositories' : 'Your repositories'
    }
    return (
      <div className="clone-repository-list-content clone-repository-list-group-header">
        {header}
      </div>
    )
  }

  private renderItem = (
    item: IClonableRepositoryListItem,
    matches: IMatches
  ) => {
    return (
      <div className="clone-repository-list-item">
        <Octicon className="icon" symbol={item.icon} />
        <div className="name" title={item.text[0]}>
          <HighlightText text={item.text[0]} highlight={matches.title} />
        </div>
      </div>
    )
  }
}
