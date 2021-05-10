import * as React from 'react'
import { clipboard } from 'electron'

import { Repository } from '../../models/repository'
import { Octicon, iconForRepository, OcticonSymbol } from '../octicons'
import { showContextualMenu } from '../main-process-proxy'
import { Repositoryish } from './group-repositories'
import { IMenuItem } from '../../lib/menu-item'
import { HighlightText } from '../lib/highlight-text'
import { IMatches } from '../../lib/fuzzy-find'
import { IAheadBehind } from '../../models/branch'
import {
  RevealInFileManagerLabel,
  DefaultEditorLabel,
} from '../lib/context-menu'
import { enableRepositoryAliases } from '../../lib/feature-flag'
import classNames from 'classnames'

interface IRepositoryListItemProps {
  readonly repository: Repositoryish

  /** Whether the user has enabled the setting to confirm removing a repository from the app */
  readonly askForConfirmationOnRemoveRepository: boolean

  /** Called when the repository should be removed. */
  readonly onRemoveRepository: (repository: Repositoryish) => void

  /** Called when the repository should be shown in Finder/Explorer/File Manager. */
  readonly onShowRepository: (repository: Repositoryish) => void

  /** Called when the repository should be shown in the shell. */
  readonly onOpenInShell: (repository: Repositoryish) => void

  /** Called when the repository should be opened in an external editor */
  readonly onOpenInExternalEditor: (repository: Repositoryish) => void

  /** Called when the repository alias should be changed */
  readonly onChangeRepositoryAlias: (repository: Repository) => void

  /** Called when the repository alias should be removed */
  readonly onRemoveRepositoryAlias: (repository: Repository) => void

  /** The current external editor selected by the user */
  readonly externalEditorLabel?: string

  /** Does the repository need to be disambiguated in the list? */
  readonly needsDisambiguation: boolean

  /** The label for the user's preferred shell. */
  readonly shellLabel: string

  /** The characters in the repository name to highlight */
  readonly matches: IMatches

  /** Number of commits this local repo branch is behind or ahead of its remote branch */
  readonly aheadBehind: IAheadBehind | null

  /** Number of uncommitted changes */
  readonly changedFilesCount: number
}

/** A repository item. */
export class RepositoryListItem extends React.Component<
  IRepositoryListItemProps,
  {}
> {
  public render() {
    const repository = this.props.repository
    const path = repository.path
    const gitHubRepo =
      repository instanceof Repository ? repository.gitHubRepository : null
    const hasChanges = this.props.changedFilesCount > 0

    const alias: string | null =
      repository instanceof Repository ? repository.alias : null

    const repoTooltipComponents = gitHubRepo
      ? [gitHubRepo.fullName, gitHubRepo.htmlURL, path]
      : [path]

    if (alias !== null) {
      repoTooltipComponents.unshift(alias)
    }

    const repoTooltip = repoTooltipComponents.join('\n')

    let prefix: string | null = null
    if (this.props.needsDisambiguation && gitHubRepo) {
      prefix = `${gitHubRepo.owner.login}/`
    }

    const classNameList = classNames('name', {
      alias: alias !== null,
    })

    return (
      <div
        onContextMenu={this.onContextMenu}
        className="repository-list-item"
        title={repoTooltip}
      >
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
      </div>
    )
  }

  public shouldComponentUpdate(nextProps: IRepositoryListItemProps): boolean {
    if (
      nextProps.repository instanceof Repository &&
      this.props.repository instanceof Repository
    ) {
      return (
        nextProps.repository.id !== this.props.repository.id ||
        nextProps.matches !== this.props.matches
      )
    } else {
      return true
    }
  }

  private onContextMenu = (event: React.MouseEvent<any>) => {
    event.preventDefault()

    const repository = this.props.repository
    const missing = repository instanceof Repository && repository.missing
    const openInExternalEditor = this.props.externalEditorLabel
      ? `Open in ${this.props.externalEditorLabel}`
      : DefaultEditorLabel

    const items: ReadonlyArray<IMenuItem> = [
      ...this.buildAliasMenuItems(),
      {
        label: __DARWIN__ ? 'Copy Repo Name' : 'Copy repo name',
        action: this.copyToClipboard,
      },
      { type: 'separator' },
      {
        label: `Open in ${this.props.shellLabel}`,
        action: this.openInShell,
        enabled: !missing,
      },
      {
        label: RevealInFileManagerLabel,
        action: this.showRepository,
        enabled: !missing,
      },
      {
        label: openInExternalEditor,
        action: this.openInExternalEditor,
        enabled: !missing,
      },
      { type: 'separator' },
      {
        label: this.props.askForConfirmationOnRemoveRepository
          ? 'Remove…'
          : 'Remove',
        action: this.removeRepository,
      },
    ]

    showContextualMenu(items)
  }

  private buildAliasMenuItems(): ReadonlyArray<IMenuItem> {
    const repository = this.props.repository

    if (!(repository instanceof Repository) || !enableRepositoryAliases()) {
      return []
    }

    const verb = repository.alias == null ? 'Create' : 'Change'
    const items: Array<IMenuItem> = [
      {
        label: __DARWIN__ ? `${verb} Alias` : `${verb} alias`,
        action: this.changeAlias,
      },
    ]

    if (repository.alias !== null) {
      items.push({
        label: __DARWIN__ ? 'Remove Alias' : 'Remove alias',
        action: this.removeAlias,
      })
    }

    return items
  }

  private removeRepository = () => {
    this.props.onRemoveRepository(this.props.repository)
  }

  private showRepository = () => {
    this.props.onShowRepository(this.props.repository)
  }

  private openInShell = () => {
    this.props.onOpenInShell(this.props.repository)
  }

  private openInExternalEditor = () => {
    this.props.onOpenInExternalEditor(this.props.repository)
  }

  private changeAlias = () => {
    if (this.props.repository instanceof Repository) {
      this.props.onChangeRepositoryAlias(this.props.repository)
    }
  }

  private removeAlias = () => {
    if (this.props.repository instanceof Repository) {
      this.props.onRemoveRepositoryAlias(this.props.repository)
    }
  }

  private copyToClipboard = () => {
    clipboard.writeText(this.props.repository.name)
  }
}

const renderRepoIndicators: React.FunctionComponent<{
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
    <div className="ahead-behind" title={aheadBehindTooltip}>
      {ahead > 0 && <Octicon symbol={OcticonSymbol.arrowUp} />}
      {behind > 0 && <Octicon symbol={OcticonSymbol.arrowDown} />}
    </div>
  )
}

const renderChangesIndicator = () => {
  return (
    <div
      className="change-indicator-wrapper"
      title="There are uncommitted changes in this repository"
    >
      <Octicon symbol={OcticonSymbol.dotFill} />
    </div>
  )
}

const commitGrammar = (commitNum: number) =>
  `${commitNum} commit${commitNum > 1 ? 's' : ''}` // english is hard
