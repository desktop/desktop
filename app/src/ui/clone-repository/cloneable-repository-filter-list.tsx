import * as React from 'react'
import { Account } from '../../models/account'
import { IFilterListGroup } from '../lib/filter-list'
import { IAPIRepository } from '../../lib/api'
import {
  ICloneableRepositoryListItem,
  groupRepositories,
  YourRepositoriesIdentifier,
  LocalRepositoriesIdentifier,
  RecentRepositoriesIdentifier,
} from './group-repositories'
import type { ILocalRepoInfo, ILocalOnlyRepoInfo } from './group-repositories'
import memoizeOne from 'memoize-one'
import { Button } from '../lib/button'
import { IMatches } from '../../lib/fuzzy-find'
import { Octicon, syncClockwise } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { HighlightText } from '../lib/highlight-text'
import { ClickSource } from '../lib/list'
import { LinkButton } from '../lib/link-button'
import { Ref } from '../lib/ref'
import { SectionFilterList } from '../lib/section-filter-list'
import { TooltippedContent } from '../lib/tooltipped-content'

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
   * Recently accessed repositories to show at the top.
   */
  readonly recentRepositories?: ReadonlyArray<IAPIRepository>

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

  readonly renderPreFilter?: () => JSX.Element | null

  /**
   * Local repositories for determining clone status.
   */
  readonly localRepositories?: ReadonlyArray<ILocalRepoInfo>

  /**
   * Local-only repositories (not associated with GitHub).
   */
  readonly localOnlyRepositories?: ReadonlyArray<ILocalOnlyRepoInfo>

  /**
   * Recent local-only repositories to show in the Recent section.
   */
  readonly recentLocalOnlyRepositories?: ReadonlyArray<ILocalOnlyRepoInfo>

  /**
   * Called when a local-only repository is clicked.
   */
  readonly onLocalOnlyRepositoryClicked?: (repoId: number) => void

  /**
   * Called when the user wants to clone a repository.
   */
  readonly onCloneRepository?: (repository: IAPIRepository) => void

  /**
   * Called when the user wants to locate/show a repository in the file system.
   */
  readonly onLocateRepository?: (path: string) => void

  /**
   * Called when the user wants to add an existing local repository
   * (browse for folder where repo already exists).
   */
  readonly onAddExistingRepository?: (repository: IAPIRepository) => void
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

export class CloneableRepositoryFilterList extends React.PureComponent<ICloneableRepositoryFilterListProps> {
  /**
   * A memoized function for grouping repositories for display
   * in the FilterList. The group will not be recomputed as long
   * as the provided list of repositories is equal to the last
   * time the method was called (reference equality).
   */
  private getRepositoryGroups = memoizeOne(
    (
      repositories: ReadonlyArray<IAPIRepository> | null,
      login: string,
      localRepos?: ReadonlyArray<ILocalRepoInfo>,
      localOnlyRepos?: ReadonlyArray<ILocalOnlyRepoInfo>,
      recentRepos?: ReadonlyArray<IAPIRepository>,
      recentLocalOnlyRepos?: ReadonlyArray<ILocalOnlyRepoInfo>
    ) =>
      repositories === null
        ? groupRepositories([], login, localRepos, localOnlyRepos, recentRepos, recentLocalOnlyRepos)
        : groupRepositories(repositories, login, localRepos, localOnlyRepos, recentRepos, recentLocalOnlyRepos)
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

  private getGroupAriaLabelGetter =
    (groups: ReadonlyArray<IFilterListGroup<ICloneableRepositoryListItem>>) =>
    (group: number) => {
      const groupIdentifier = groups[group].identifier
      if (groupIdentifier === YourRepositoriesIdentifier) {
        return this.getYourRepositoriesLabel()
      } else if (groupIdentifier === LocalRepositoriesIdentifier) {
        return this.getLocalRepositoriesLabel()
      } else if (groupIdentifier === RecentRepositoriesIdentifier) {
        return this.getRecentRepositoriesLabel()
      }
      return groupIdentifier
    }

  public render() {
    const { repositories, account, selectedItem, localRepositories, localOnlyRepositories, recentRepositories, recentLocalOnlyRepositories } = this.props

    const groups = this.getRepositoryGroups(
      repositories,
      account.login,
      localRepositories,
      localOnlyRepositories,
      recentRepositories,
      recentLocalOnlyRepositories
    )
    const selectedListItem = this.getSelectedListItem(groups, selectedItem)

    return (
      <SectionFilterList<ICloneableRepositoryListItem>
        className={'clone-github-repo'}
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
        renderPreFilter={this.props.renderPreFilter}
        onItemClick={this.props.onItemClicked || this.props.onLocalOnlyRepositoryClicked ? this.onItemClick : undefined}
        placeholderText={'Filter your repositories'}
        getGroupAriaLabel={this.getGroupAriaLabelGetter(groups)}
      />
    )
  }

  private onItemClick = (
    item: ICloneableRepositoryListItem,
    source: ClickSource
  ) => {
    // Handle local-only repository clicks
    if (item.isLocalOnly && item.localRepoId !== undefined) {
      const { onLocalOnlyRepositoryClicked } = this.props
      if (onLocalOnlyRepositoryClicked) {
        onLocalOnlyRepositoryClicked(item.localRepoId)
      }
      return
    }

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

  private getYourRepositoriesLabel = () => {
    return __DARWIN__ ? 'Your Repositories' : 'Your repositories'
  }

  private getLocalRepositoriesLabel = () => {
    return __DARWIN__ ? 'Local Repositories' : 'Local repositories'
  }

  private getRecentRepositoriesLabel = () => {
    return 'Recent'
  }

  private renderGroupHeader = (identifier: string) => {
    let header = identifier
    if (identifier === YourRepositoriesIdentifier) {
      header = this.getYourRepositoriesLabel()
    } else if (identifier === LocalRepositoriesIdentifier) {
      header = this.getLocalRepositoriesLabel()
    } else if (identifier === RecentRepositoriesIdentifier) {
      header = this.getRecentRepositoriesLabel()
    }
    return (
      <div className="clone-repository-list-content clone-repository-list-group-header">
        {header}
      </div>
    )
  }

  private onCloneClick = (
    e: React.MouseEvent<HTMLButtonElement>,
    item: ICloneableRepositoryListItem
  ) => {
    e.stopPropagation()
    e.preventDefault()

    const { onCloneRepository, repositories } = this.props
    if (!onCloneRepository || !repositories) {
      return
    }

    const repo = findRepositoryForListItem(repositories, item)
    if (repo) {
      onCloneRepository(repo)
    }
  }

  private onLocateClick = (
    e: React.MouseEvent<HTMLButtonElement>,
    item: ICloneableRepositoryListItem
  ) => {
    e.stopPropagation()
    e.preventDefault()

    const { onLocateRepository } = this.props
    if (onLocateRepository && item.localPath) {
      onLocateRepository(item.localPath)
    }
  }

  private onAddExistingClick = (
    e: React.MouseEvent<HTMLButtonElement>,
    item: ICloneableRepositoryListItem
  ) => {
    e.stopPropagation()
    e.preventDefault()

    const { onAddExistingRepository, repositories } = this.props
    if (!onAddExistingRepository || !repositories) {
      return
    }

    const repo = findRepositoryForListItem(repositories, item)
    if (repo) {
      onAddExistingRepository(repo)
    }
  }

  private renderItem = (
    item: ICloneableRepositoryListItem,
    matches: IMatches
  ) => {
    const { onCloneRepository, onLocateRepository, onAddExistingRepository } = this.props

    // Local-only repos have a simpler display
    if (item.isLocalOnly) {
      return (
        <div className="clone-repository-list-item local-only-repo">
          <Octicon className="icon" symbol={item.icon} />
          <TooltippedContent
            className="name"
            tooltip={item.localPath || item.text[0]}
            onlyWhenOverflowed={true}
            tagName="div"
          >
            <HighlightText text={item.text[0]} highlight={matches.title} />
          </TooltippedContent>
          <div className="repo-status-actions">
            <span className="local-badge" title="Local repository">
              <Octicon symbol={octicons.deviceDesktop} />
            </span>
          </div>
        </div>
      )
    }

    const showActions = onCloneRepository || onLocateRepository || onAddExistingRepository

    return (
      <div className="clone-repository-list-item">
        <Octicon className="icon" symbol={item.icon} />
        <TooltippedContent
          className="name"
          tooltip={item.text[0]}
          onlyWhenOverflowed={true}
          tagName="div"
        >
          <HighlightText text={item.text[0]} highlight={matches.title} />
        </TooltippedContent>
        {item.archived && <div className="archived">Archived</div>}
        {showActions && (
          <div className="repo-status-actions">
            {item.isCloned ? (
              <>
                <span className="cloned-badge" title="Downloaded">
                  <Octicon symbol={octicons.check} />
                </span>
                {onLocateRepository && item.localPath && (
                  <button
                    className="locate-button"
                    onClick={e => this.onLocateClick(e, item)}
                    title={`Show in Finder: ${item.localPath}`}
                  >
                    <Octicon symbol={octicons.fileDirectory} />
                  </button>
                )}
              </>
            ) : (
              <>
                <span className="not-cloned-badge" title="Not downloaded">
                  <Octicon symbol={octicons.cloud} />
                </span>
                {onAddExistingRepository && (
                  <button
                    className="add-existing-button"
                    onClick={e => this.onAddExistingClick(e, item)}
                    title="Add existing local repository"
                  >
                    <Octicon symbol={octicons.fileDirectory} />
                  </button>
                )}
                {onCloneRepository && (
                  <button
                    className="clone-button"
                    onClick={e => this.onCloneClick(e, item)}
                    title="Clone this repository"
                  >
                    <Octicon symbol={octicons.download} />
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>
    )
  }

  private renderPostFilter = () => {
    const tooltip = 'Refresh the list of repositories'

    return (
      <Button
        disabled={this.props.loading}
        onClick={this.refreshRepositories}
        ariaLabel={tooltip}
        tooltip={tooltip}
      >
        <Octicon
          symbol={syncClockwise}
          className={this.props.loading ? 'spin' : undefined}
        />
      </Button>
    )
  }

  private renderNoItems = () => {
    const { loading, repositories, account } = this.props

    if (loading && (repositories === null || repositories.length === 0)) {
      return (
        <div className="no-items loading">{`Loading repositories from ${account.friendlyEndpoint}…`}</div>
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
          <Ref>{this.props.account.login}</Ref> on {account.friendlyEndpoint}.{' '}
          <LinkButton onClick={this.refreshRepositories}>
            Refresh this list
          </LinkButton>{' '}
          if you've created a repository recently.
        </div>
      </div>
    )
  }
}
