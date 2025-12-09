import * as React from 'react'
import * as octicons from '../octicons/octicons.generated'
import { ToolbarDropdown, DropdownState, ToolbarDropdownStyle } from './dropdown'
import { IAPIProjectV2 } from '../../lib/api'
import { FilterList, IFilterListGroup, IFilterListItem } from '../lib/filter-list'
import { IMatches } from '../../lib/fuzzy-find'
import { ClickSource } from '../lib/list'
import { Octicon } from '../octicons'

interface IProjectListItem extends IFilterListItem {
  readonly id: string
  readonly text: ReadonlyArray<string>
  readonly project: IAPIProjectV2 | null
}

interface IProjectDropdownProps {
  /** The list of projects for the selected owner */
  readonly projects: ReadonlyArray<IAPIProjectV2>

  /** The currently selected project */
  readonly selectedProject: IAPIProjectV2 | null

  /** Called when a project is selected */
  readonly onProjectSelected: (project: IAPIProjectV2 | null) => void

  /** Whether the dropdown is open */
  readonly isOpen: boolean

  /** Called when the dropdown state changes */
  readonly onDropdownStateChanged: (state: DropdownState) => void

  /** Whether the dropdown should be disabled */
  readonly disabled?: boolean
}

interface IProjectDropdownState {
  readonly filterText: string
}

export class ProjectDropdown extends React.Component<
  IProjectDropdownProps,
  IProjectDropdownState
> {
  public constructor(props: IProjectDropdownProps) {
    super(props)
    this.state = {
      filterText: '',
    }
  }

  private onDropdownStateChanged = (
    state: DropdownState,
    source: 'keyboard' | 'pointer'
  ) => {
    if (this.props.disabled && state === 'open') {
      return
    }
    this.props.onDropdownStateChanged(state)
    if (state === 'closed') {
      this.setState({ filterText: '' })
    }
  }

  private onFilterTextChanged = (filterText: string) => {
    this.setState({ filterText })
  }

  private onItemClick = (item: IProjectListItem, source: ClickSource) => {
    this.props.onProjectSelected(item.project)
    this.props.onDropdownStateChanged('closed')
    this.setState({ filterText: '' })
  }

  private buildProjectGroups(): ReadonlyArray<IFilterListGroup<IProjectListItem>> {
    const { projects } = this.props

    const items: IProjectListItem[] = [
      {
        id: '',
        text: ['All Projects'],
        project: null,
      },
      ...projects.map(project => ({
        id: project.id,
        text: [project.title],
        project,
      })),
    ]

    return [
      {
        identifier: 'projects',
        items,
      },
    ]
  }

  private renderItem = (
    item: IProjectListItem,
    matches: IMatches
  ): JSX.Element | null => {
    const { selectedProject } = this.props
    const isSelected =
      (item.project === null && selectedProject === null) ||
      (item.project !== null &&
        selectedProject !== null &&
        item.project.id === selectedProject.id)

    const title = item.project?.title || 'All Projects'

    return (
      <div className="project-list-item">
        <span className="project-name">{title}</span>
        {isSelected && (
          <span className="checkmark">
            <Octicon symbol={octicons.check} />
          </span>
        )}
      </div>
    )
  }

  private getSelectedItem(): IProjectListItem | null {
    const groups = this.buildProjectGroups()
    const { selectedProject } = this.props

    for (const group of groups) {
      for (const item of group.items) {
        if (
          (selectedProject === null && item.project === null) ||
          (selectedProject !== null &&
            item.project !== null &&
            item.project.id === selectedProject.id)
        ) {
          return item
        }
      }
    }
    return null
  }

  private renderDropdownContent = (): JSX.Element => {
    const groups = this.buildProjectGroups()

    return (
      <div className="project-dropdown-content">
        <FilterList<IProjectListItem>
          className="project-filter-list"
          rowHeight={30}
          groups={groups}
          selectedItem={this.getSelectedItem()}
          filterText={this.state.filterText}
          onFilterTextChanged={this.onFilterTextChanged}
          onItemClick={this.onItemClick}
          renderItem={this.renderItem}
          placeholderText="Filter projects..."
          invalidationProps={this.props.projects}
        />
      </div>
    )
  }

  public render() {
    const { selectedProject, isOpen, disabled } = this.props
    const title = selectedProject?.title || 'All Projects'
    const dropdownState: DropdownState = isOpen ? 'open' : 'closed'

    return (
      <ToolbarDropdown
        className="project-dropdown"
        icon={octicons.project}
        title={title}
        description="Project"
        dropdownState={dropdownState}
        onDropdownStateChanged={this.onDropdownStateChanged}
        dropdownContentRenderer={this.renderDropdownContent}
        dropdownStyle={ToolbarDropdownStyle.MultiOption}
        showDisclosureArrow={true}
        disabled={disabled}
      />
    )
  }
}
