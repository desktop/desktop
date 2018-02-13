import * as React from 'react'
import { Repository } from '../../models/repository'
import { Octicon, iconForRepository } from '../octicons'
import { showContextualMenu } from '../main-process-proxy'
import { Repositoryish } from './group-repositories'
import { IMenuItem } from '../../lib/menu-item'
import { HighlightText } from '../lib/highlight-text'

const defaultEditorLabel = __DARWIN__
  ? 'Open in External Editor'
  : 'Open in external editor'

interface IRepositoryListItemProps {
  readonly repository: Repositoryish

  /** Called when the repository should be removed. */
  readonly onRemoveRepository: (repository: Repositoryish) => void

  /** Called when the repository should be shown in Finder/Explorer/File Manager. */
  readonly onShowRepository: (repository: Repositoryish) => void

  /** Called when the repository should be shown in the shell. */
  readonly onOpenInShell: (repository: Repositoryish) => void

  /** Called when the repository should be opened in an external editor */
  readonly onOpenInExternalEditor: (repository: Repositoryish) => void

  /** The current external editor selected by the user */
  readonly externalEditorLabel?: string

  /** Does the repository need to be disambiguated in the list? */
  readonly needsDisambiguation: boolean

  /** The label for the user's preferred shell. */
  readonly shellLabel: string

  /** The characters in the repository name to highlight */
  readonly matches: ReadonlyArray<number>
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
    const tooltip = gitHubRepo
      ? gitHubRepo.fullName + '\n' + gitHubRepo.htmlURL + '\n' + path
      : path

    let prefix: string | null = null
    if (this.props.needsDisambiguation && gitHubRepo) {
      prefix = `${gitHubRepo.owner.login}/`
    }

    return (
      <div
        onContextMenu={this.onContextMenu}
        className="repository-list-item"
        title={tooltip}
      >
        <Octicon symbol={iconForRepository(repository)} />

        <div className="name">
          {prefix ? <span className="prefix">{prefix}</span> : null}
          <HighlightText
            text={repository.name}
            highlight={this.props.matches}
          />
        </div>
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
      : defaultEditorLabel

    const showRepositoryLabel = __DARWIN__
      ? 'Show in Finder'
      : __WIN32__ ? 'Show in Explorer' : 'Show in your File Manager'

    const items: ReadonlyArray<IMenuItem> = [
      {
        label: `Open in ${this.props.shellLabel}`,
        action: this.openInShell,
        enabled: !missing,
      },
      {
        label: showRepositoryLabel,
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
        label: 'Remove',
        action: this.removeRepository,
      },
    ]
    showContextualMenu(items)
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
}
