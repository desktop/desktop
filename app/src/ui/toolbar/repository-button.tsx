import { OcticonSymbol, iconForRepository } from '../octicons'
import { PossibleSelections, FoldoutType, Foldout } from '../../lib/app-state'
import { ToolbarDropdown, DropdownState } from '.'
import { Dispatcher } from '../dispatcher'
import { Repository } from '../../models/repository'
import { CloningRepository } from '../../models/cloning-repository'
import * as React from 'react'

interface IRepositoryToolbarButtonProps {
  readonly currentFoldout: Foldout | null
  readonly dispatcher: Dispatcher
  readonly renderRepositoryList: () => JSX.Element
  readonly repositories: ReadonlyArray<Repository | CloningRepository>
  readonly selection: PossibleSelections | null
  readonly sidebarWidth: number
}

export function RepositoryToolbarButton({
  currentFoldout,
  dispatcher,
  repositories,
  renderRepositoryList,
  selection,
  sidebarWidth,
}: IRepositoryToolbarButtonProps) {
  const repository = selection ? selection.repository : null

  let icon: OcticonSymbol
  let title: string
  if (repository) {
    icon = iconForRepository(repository)
    title = repository.name
  } else if (repositories.length > 0) {
    icon = OcticonSymbol.repo
    title = __DARWIN__ ? 'Select a Repository' : 'Select a repository'
  } else {
    icon = OcticonSymbol.repo
    title = __DARWIN__ ? 'No Repositories' : 'No repositories'
  }

  const isOpen =
    currentFoldout && currentFoldout.type === FoldoutType.Repository

  const currentState: DropdownState = isOpen ? 'open' : 'closed'

  const tooltip = repository && !isOpen ? repository.path : undefined

  const foldoutStyle: React.CSSProperties = {
    position: 'absolute',
    marginLeft: 0,
    width: sidebarWidth,
    minWidth: sidebarWidth,
    height: '100%',
    top: 0,
  }

  const onRepositoryDropdownStateChanged = (newState: DropdownState) => {
    if (newState === 'open') {
      dispatcher.showFoldout({ type: FoldoutType.Repository })
    } else {
      dispatcher.closeFoldout(FoldoutType.Repository)
    }
  }

  return (
    <ToolbarDropdown
      icon={icon}
      title={title}
      description={__DARWIN__ ? 'Current Repository' : 'Current repository'}
      tooltip={tooltip}
      foldoutStyle={foldoutStyle}
      onDropdownStateChanged={onRepositoryDropdownStateChanged}
      dropdownContentRenderer={renderRepositoryList}
      dropdownState={currentState}
    />
  )
}
