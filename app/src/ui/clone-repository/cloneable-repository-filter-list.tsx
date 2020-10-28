import * as React from 'react'
import { Account } from '../../models/account'
import { FilterList, IFilterListGroup } from '../lib/filter-list'
import { IAPIRepository, getDotComAPIEndpoint, getHTMLURL } from '../../lib/api'
import {
  ICloneableRepositoryListItem,
  groupRepositories,
  YourRepositoriesIdentifier,
} from './group-repositories'
import memoizeOne from 'memoize-one'
import { Button } from '../lib/button'
import { IMatches } from '../../lib/fuzzy-find'
import { Octicon, syncClockwise } from '../octicons'
import { HighlightText } from '../lib/highlight-text'
import { ClickSource } from '../lib/list'
import { LinkButton } from '../lib/link-button'
import { Ref } from '../lib/ref'

interface ICloneableRepositoryFilterListProps {
  /** The account to clone from. */
  readonly account: Account

  /**
   * The currently selected repository, or null if no repository
   * is selected.
   */
  readonly selectedItem: IAPIRepository | null

  /** Called when a repository is selected. */
  readonly onSelectionChanged: (selectedItem: IAPIRepository | null) => void

  /**
   * The list of repositories that the account has explicit permissions
   * to access, or null if no repositories has been loaded yet.
   */
  readonly repositories: ReadonlyArray<IAPIRepository> | null

  /**
   * Whether or not the list of repositories is currently being loaded
   * by the API Repositories Store. This determines whether the loading
   * indicator is shown or not.
   */
  readonly loading: boolean

  /**
   * The contents of the filter text box used to filter the list of
   * repositories.
   */
  readonly filterText: string

  /**
   * Called when the filter text is changed by the user entering a new
   * value in the filter text box.
   */
  readonly onFilterTextChanged: (filterText: string) => void

  /**
   * Called when the user requests a refresh of the repositories
   * available for cloning.
   */
  readonly onRefreshRepositories: (account: Account) => void

  /**
   * This function will be called when a pointer device is pressed and then
   * released on a selectable row. Note that this follows the conventions
   * of button elements such that pressing Enter or Space on a keyboard
   * while focused on a particular row will also trigger this event. Consumers
   * can differentiate between the two using the source parameter.
   *
   * Consumers of this event do _not_ have to call event.preventDefault,
   * when this event is subscribed to the list will automatically call it.
   */
  readonly onItemClicked?: (
    repository: IAPIRepository,
    source: ClickSource
  ) => void
}

const RowHeight = 31

/**
 * Iterate over all groups until a list item is found that matches
 * the clone url of the provided repository.
 */
function findMatchingListItem(
  groups: ReadonlyArray<IFilterListGroup<ICloneableRepositoryListItem>>,
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

/**
 * Attempt to locate the source IAPIRepository instance given
 * an ICloneableRepositoryList item using clone_url for the
 * equality comparison.
 */
function findRepositoryForListItem(
  repositories: ReadonlyArray<IAPIRepository>,
  listItem: ICloneableRepositoryListItem
) {
  return repositories.find(r => r.clone_url === listItem.url) || null
}

export class CloneableRepositoryFilterList extends React.PureComponent<
  ICloneableRepositoryFilterListProps
> {
  /**
   * A memoized function for grouping repositories for display
   * in the FilterList. The group will not be recomputed as long
   * as the provided list of repositories is equal to the last
   * time the method was called (reference equality).
   */
  private getRepositoryGroups = memoizeOne(
    (repositories: ReadonlyArray<IAPIRepository> | null, login: string) =>
      repositories === null ? [] : groupRepositories(repositories, login)
  )

  /**
   * A memoized function for finding the selected list item based
   * on an IAPIRepository instance. The selected item will not be
   * recomputed as long as the provided list of repositories and
   * the selected data object is equal to the last time the method
   * was called (reference equality).
   *
   * See findMatchingListItem for more details.
   */
  private getSelectedListItem = memoizeOne(findMatchingListItem)

  public componentDidMount() {
    if (this.props.repositories === null) {
      this.refreshRepositories()
    }
  }

  public componentDidUpdate(prevProps: ICloneableRepositoryFilterListProps) {
    if (
      prevProps.repositories !== this.props.repositories &&
      this.props.repositories === null
    ) {
      this.refreshRepositories()
    }
  }

  private refreshRepositories = () => {
    this.props.onRefreshRepositories(this.props.account)
  }

  public render() {
    const { repositories, account, selectedItem } = this.props

    const groups = this.getRepositoryGroups(repositories, account.login)
    const selectedListItem = this.getSelectedListItem(groups, selectedItem)

    return (
      <FilterList<ICloneableRepositoryListItem>
        className="clone-github-repo"
        rowHeight={RowHeight}
        selectedItem={selectedListItem}
        renderItem={this.renderItem}
        renderGroupHeader={this.renderGroupHeader}
        onSelectionChanged={this.onSelectionChanged}
        invalidationProps={groups}
        groups={groups}
        filterText={this.props.filterText}
        onFilterTextChanged={this.props.onFilterTextChanged}
        renderNoItems={this.renderNoItems}
        renderPostFilter={this.renderPostFilter}
        onItemClick={this.props.onItemClicked ? this.onItemClick : undefined}
        placeholderText="Filter your repositories"
      />
    )
  }

  private onItemClick = (
    item: ICloneableRepositoryListItem,
    source: ClickSource
  ) => {
    const { onItemClicked, repositories } = this.props

    if (onItemClicked === undefined || repositories === null) {
      return
    }

    const selectedItem = findRepositoryForListItem(repositories, item)

    if (selectedItem !== null) {
      onItemClicked(selectedItem, source)
    }
  }

  private onSelectionChanged = (item: ICloneableRepositoryListItem | null) => {
    if (item === null || this.props.repositories === null) {
      this.props.onSelectionChanged(null)
    } else {
      this.props.onSelectionChanged(
        findRepositoryForListItem(this.props.repositories, item)
      )
    }
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
    item: ICloneableRepositoryListItem,
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

  private renderPostFilter = () => {
    return (
      <Button
        disabled={this.props.loading}
        onClick={this.refreshRepositories}
        tooltip="Refresh the list of repositories"
      >
        <Octicon
          symbol={syncClockwise}
          className={this.props.loading ? 'spin' : undefined}
        />
      </Button>
    )
  }

  private renderNoItems = () => {
    const { loading, repositories } = this.props
    const endpointName =
      this.props.account.endpoint === getDotComAPIEndpoint()
        ? 'GitHub.com'
        : getHTMLURL(this.props.account.endpoint)

    if (loading && (repositories === null || repositories.length === 0)) {
      return (
        <div className="no-items loading">{`Loading repositories from ${endpointName}…`}</div>
      )
    }

    if (this.props.filterText.length !== 0) {
      return (
        <div className="no-items no-results-found">
          <div>
            Sorry, I can't find any repository matching{' '}
            <Ref>{this.props.filterText}</Ref>
          </div>
        </div>
      )
    }

    return (
      <div className="no-items empty-repository-list">
        <div>
          Looks like there are no repositories for{' '}
          <Ref>{this.props.account.login}</Ref> on {endpointName}.{' '}
          <LinkButton onClick={this.refreshRepositories}>
            Refresh this list
          </LinkButton>{' '}
          if you've created a repository recently.
        </div>
      </div>
    )
  }
}
