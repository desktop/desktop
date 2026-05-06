import * as React from 'react'

import { Repository } from '../../models/repository'
import { Octicon, iconForRepository } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { Repositoryish } from './group-repositories'
import { HighlightText } from '../lib/highlight-text'
import { IMatches } from '../../lib/fuzzy-find'
import { IAheadBehind } from '../../models/branch'
import classNames from 'classnames'
import { createObservableRef } from '../lib/observable-ref'
import { Tooltip } from '../lib/tooltip'
import { enableAccessibleListToolTips } from '../../lib/feature-flag'
import { TooltippedContent } from '../lib/tooltipped-content'

interface IRepositoryListItemProps {
  readonly repository: Repositoryish

  /** Does the repository need to be disambiguated in the list? */
  readonly needsDisambiguation: boolean

  /** The characters in the repository name to highlight */
  readonly matches: IMatches

  /** Number of commits this local repo branch is behind or ahead of its remote branch */
  readonly aheadBehind: IAheadBehind | null

  /** Number of uncommitted changes */
  readonly changedFilesCount: number

  /**
   * Called when the user clicks the favourite star on this row. The host is
   * expected to open a small picker (group list + "New group…") or remove the
   * repo from its current group.
   */
  readonly onManageFavourite: (
    repository: Repository,
    target: HTMLElement
  ) => void
}

/** A repository item. */
export class RepositoryListItem extends React.Component<
  IRepositoryListItemProps,
  {}
> {
  private readonly listItemRef = createObservableRef<HTMLDivElement>()

  public render() {
    const repository = this.props.repository
    const gitHubRepo =
      repository instanceof Repository ? repository.gitHubRepository : null
    const hasChanges = this.props.changedFilesCount > 0

    const alias: string | null =
      repository instanceof Repository ? repository.alias : null

    let prefix: string | null = null
    if (this.props.needsDisambiguation && gitHubRepo) {
      prefix = `${gitHubRepo.owner.login}/`
    }

    const classNameList = classNames('name', {
      alias: alias !== null,
    })

    return (
      <div className="repository-list-item" ref={this.listItemRef}>
        <Tooltip
          target={this.listItemRef}
          disabled={enableAccessibleListToolTips()}
        >
          {this.renderTooltip()}
        </Tooltip>

        <Octicon
          className="icon-for-repository"
          symbol={iconForRepository(repository)}
        />

        <div className={classNames(classNameList)}>
          {prefix ? <span className="prefix">{prefix}</span> : null}
          <HighlightText
            text={alias ?? repository.name}
            highlight={this.props.matches.title}
          />
        </div>

        {repository instanceof Repository &&
          renderRepoIndicators({
            aheadBehind: this.props.aheadBehind,
            hasChanges: hasChanges,
          })}

        {repository instanceof Repository && this.renderFavouriteToggle()}
      </div>
    )
  }

  private renderFavouriteToggle() {
    const repo = this.props.repository
    if (!(repo instanceof Repository)) {
      return null
    }
    const { isFavourite } = repo
    const label = isFavourite ? 'Manage favourite' : 'Add to favourites'
    return (
      <button
        type="button"
        className={classNames('favourite-toggle', { active: isFavourite })}
        onClick={this.onFavouriteToggleClick}
        aria-label={label}
        aria-pressed={isFavourite}
      >
        <Octicon symbol={isFavourite ? octicons.starFill : octicons.star} />
      </button>
    )
  }

  private onFavouriteToggleClick = (
    event: React.MouseEvent<HTMLButtonElement>
  ) => {
    event.stopPropagation()
    event.preventDefault()
    const repo = this.props.repository
    if (repo instanceof Repository) {
      this.props.onManageFavourite(repo, event.currentTarget)
    }
  }

  private renderTooltip() {
    const repo = this.props.repository
    const gitHubRepo = repo instanceof Repository ? repo.gitHubRepository : null
    const alias = repo instanceof Repository ? repo.alias : null
    const realName = gitHubRepo ? gitHubRepo.fullName : repo.name

    return (
      <>
        <div>
          <strong>{realName}</strong>
          {alias && <> ({alias})</>}
        </div>
        <div>{repo.path}</div>
      </>
    )
  }

  public shouldComponentUpdate(nextProps: IRepositoryListItemProps): boolean {
    if (
      nextProps.repository instanceof Repository &&
      this.props.repository instanceof Repository
    ) {
      return (
        nextProps.repository.id !== this.props.repository.id ||
        nextProps.repository.favouriteGroupId !==
          this.props.repository.favouriteGroupId ||
        nextProps.matches !== this.props.matches
      )
    } else {
      return true
    }
  }
}

export const renderRepoIndicators: React.FunctionComponent<{
  aheadBehind: IAheadBehind | null
  hasChanges: boolean
}> = props => {
  return (
    <div className="repo-indicators">
      {props.aheadBehind && renderAheadBehindIndicator(props.aheadBehind)}
      {props.hasChanges && renderChangesIndicator()}
    </div>
  )
}

/** Build the multi-line ahead/behind sentence used in row tooltips. */
export function getAheadBehindTooltip(
  aheadBehind: IAheadBehind | null
): string | null {
  if (aheadBehind === null) {
    return null
  }
  const { ahead, behind } = aheadBehind
  if (behind === 0 && ahead === 0) {
    return null
  }
  return (
    'The currently checked out branch is' +
    (behind ? ` ${commitGrammar(behind)} behind ` : '') +
    (behind && ahead ? 'and' : '') +
    (ahead ? ` ${commitGrammar(ahead)} ahead of ` : '') +
    'its tracked branch.'
  )
}

interface IRepositoryRowFocusTooltipProps {
  readonly repository: { readonly path: string; readonly name: string } & {
    readonly gitHubRepository?: { readonly fullName: string } | null
    readonly alias?: string | null
  }
  readonly aheadBehind: IAheadBehind | null
  readonly changedFilesCount: number
}

/**
 * The rich row-focus tooltip used by the Current Repository dropdown rows.
 * Re-exported so the favourites sidebar can render an identical popup.
 */
export function renderRepositoryRowFocusTooltip(
  props: IRepositoryRowFocusTooltipProps
): JSX.Element {
  const { repository, aheadBehind, changedFilesCount } = props
  const gitHubRepo =
    repository instanceof Repository ? repository.gitHubRepository : null
  const alias = repository instanceof Repository ? repository.alias : null
  const realName = gitHubRepo ? gitHubRepo.fullName : repository.name
  const aheadBehindTooltip = getAheadBehindTooltip(aheadBehind)
  const hasChanges = changedFilesCount > 0
  const ahead = aheadBehind?.ahead ?? 0
  const behind = aheadBehind?.behind ?? 0

  return (
    <div className="repository-list-item-tooltip list-item-tooltip">
      <div>
        <div className="label">Full Name: </div>
        {realName}
        {alias && <> ({alias})</>}
      </div>
      <div>
        <div className="label">Path: </div>
        {repository.path}
      </div>
      {aheadBehindTooltip && (
        <div>
          <div className="label">
            <div className="ahead-behind">
              {ahead > 0 && <Octicon symbol={octicons.arrowUp} />}
              {behind > 0 && <Octicon symbol={octicons.arrowDown} />}
            </div>
          </div>
          {aheadBehindTooltip}
        </div>
      )}
      {hasChanges && (
        <div>
          <div className="label">
            <span className="change-indicator-wrapper">
              <Octicon symbol={octicons.dotFill} />
            </span>
          </div>
          There are uncommitted changes in this repository.
        </div>
      )}
    </div>
  )
}

const renderAheadBehindIndicator = (aheadBehind: IAheadBehind) => {
  const { ahead, behind } = aheadBehind
  if (ahead === 0 && behind === 0) {
    return null
  }

  const aheadBehindTooltip =
    'The currently checked out branch is' +
    (behind ? ` ${commitGrammar(behind)} behind ` : '') +
    (behind && ahead ? 'and' : '') +
    (ahead ? ` ${commitGrammar(ahead)} ahead of ` : '') +
    'its tracked branch.'

  return (
    <TooltippedContent
      className="ahead-behind"
      tagName="div"
      tooltip={aheadBehindTooltip}
      disabled={enableAccessibleListToolTips()}
    >
      {ahead > 0 && <Octicon symbol={octicons.arrowUp} />}
      {behind > 0 && <Octicon symbol={octicons.arrowDown} />}
    </TooltippedContent>
  )
}

const renderChangesIndicator = () => {
  return (
    <TooltippedContent
      className="change-indicator-wrapper"
      tooltip="There are uncommitted changes in this repository"
      disabled={enableAccessibleListToolTips()}
    >
      <Octicon symbol={octicons.dotFill} />
    </TooltippedContent>
  )
}

export const commitGrammar = (commitNum: number) =>
  `${commitNum} commit${commitNum > 1 ? 's' : ''}` // english is hard
