import * as React from 'react'

import { Account } from '../../models/account'
import { DialogContent } from '../dialog'
import { TextBox } from '../lib/text-box'
import { Row } from '../lib/row'
import { Button } from '../lib/button'
import { Loading } from '../lib/loading'
import { Octicon, OcticonSymbol } from '../octicons'
import { FilterList } from '../lib/filter-list'
import { IAPIRepository } from '../../lib/api'
import { IFilterListGroup } from '../lib/filter-list'
import { IMatches } from '../../lib/fuzzy-find'
import {
  IClonableRepositoryListItem,
  groupRepositories,
  YourRepositoriesIdentifier,
} from './group-repositories'
import { HighlightText } from '../lib/highlight-text'
import memoizeOne from 'memoize-one'

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

  /**
   * The currently selected repository, or null if no repository
   * is selected.
   */
  readonly selectedItem: IAPIRepository | null

  /** Called when a repository is selected. */
  readonly onSelectionChanged: (selectedItem: IAPIRepository | null) => void

  readonly repositories: ReadonlyArray<IAPIRepository> | null
  readonly loading: boolean
  readonly onRefreshRepositories: (account: Account) => void
  readonly filterText: string
  readonly onFilterTextChanged: (filterText: string) => void
}

const RowHeight = 31

function findMatchingListItem(
  groups: ReadonlyArray<IFilterListGroup<IClonableRepositoryListItem>>,
  selectedRepository: IAPIRepository | null
) {
  if (selectedRepository !== null) {
    for (const group of groups) {
      for (const item of group.items) {
        if (item.url === selectedRepository.clone_url) {
          return item
        }
      }
    }
  }

  return null
}

export class CloneGithubRepository extends React.PureComponent<
  ICloneGithubRepositoryProps
> {
  private getRepositoryGroups = memoizeOne(
    (repositories: ReadonlyArray<IAPIRepository> | null) =>
      this.props.repositories === null
        ? []
        : groupRepositories(this.props.repositories, this.props.account.login)
  )

  private getSelectedListItem = memoizeOne(findMatchingListItem)

  public componentDidMount() {
    if (this.props.repositories === null) {
      this.refreshRepositories()
    }
  }

  private refreshRepositories = () => {
    this.props.onRefreshRepositories(this.props.account)
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
          <Button onClick={this.props.onChooseDirectory}>Choose…</Button>
        </Row>
      </DialogContent>
    )
  }

  private renderRepositoryList() {
    if (
      this.props.loading &&
      (this.props.repositories === null || this.props.repositories.length === 0)
    ) {
      return (
        <div className="clone-github-repo clone-loading">
          <Loading /> Loading repositories…
        </div>
      )
    }

    const groups = this.getRepositoryGroups(this.props.repositories)
    const selectedItem = this.getSelectedListItem(
      groups,
      this.props.selectedItem
    )

    return (
      <FilterList<IClonableRepositoryListItem>
        className="clone-github-repo"
        rowHeight={RowHeight}
        selectedItem={selectedItem}
        renderItem={this.renderItem}
        renderGroupHeader={this.renderGroupHeader}
        onSelectionChanged={this.onSelectionChanged}
        invalidationProps={groups}
        groups={groups}
        filterText={this.props.filterText}
        onFilterTextChanged={this.props.onFilterTextChanged}
        renderNoItems={this.noMatchingRepositories}
        renderPostFilter={this.renderPostFilter}
      />
    )
  }

  private renderPostFilter = () => {
    return (
      <Button
        disabled={this.props.loading}
        onClick={this.refreshRepositories}
        tooltip="Refresh the list of repositories"
      >
        <Octicon
          symbol={OcticonSymbol.sync}
          className={this.props.loading ? 'spin' : undefined}
        />
      </Button>
    )
  }

  private noMatchingRepositories = function() {
    return (
      <div className="no-results-found">
        Sorry, I can't find that repository.
      </div>
    )
  }

  private onSelectionChanged = (item: IClonableRepositoryListItem | null) => {
    if (item === null || this.props.repositories === null) {
      this.props.onSelectionChanged(null)
    } else {
      this.props.onSelectionChanged(
        this.props.repositories.find(r => r.clone_url === item.url) || null
      )
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
