import * as React from 'react'
import { Dispatcher } from '../dispatcher'
import {
  IAPIProjectV2,
  IAPIProjectV2Details,
  IAPIProjectV2View,
  IAPIProjectV2ItemWithContent,
  IAPIIdentity,
  IAPILabel,
  IAPIMilestone,
  ProjectViewLayout,
} from '../../lib/api'
import { Account } from '../../models/account'
import { API } from '../../lib/api'
import { Repository } from '../../models/repository'
import { BoardLayout } from './board-layout'
import { TableLayout } from './table-layout'
import { ViewOptionsDropdown } from './view-options-dropdown'
import { applyFilter } from './filter-utils'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { IssueDetailView, IIssueInfo } from '../tasks/issue-detail-view'
import { CreateTaskDialog } from '../tasks/create-task-dialog'
import { DialogStackContext } from '../dialog'
import { shell } from 'electron'

const ViewOrderStorageKey = 'project-view-tab-order'

interface IProjectViewProps {
  readonly dispatcher: Dispatcher
  readonly project: IAPIProjectV2
  readonly account: Account
  readonly repository: Repository | null
  readonly onClose: () => void
}

interface IProjectViewState {
  readonly projectDetails: IAPIProjectV2Details | null
  readonly isLoading: boolean
  readonly error: string | null
  readonly selectedViewId: string | null
  readonly viewOrder: ReadonlyArray<string>
  readonly draggedViewId: string | null
  readonly dragOverViewId: string | null
  readonly selectedItem: IAPIProjectV2ItemWithContent | null
  readonly showCreateDialog: boolean
  readonly createDialogInitialStatusId: string | undefined
  readonly collaborators: ReadonlyArray<IAPIIdentity>
  readonly labels: ReadonlyArray<IAPILabel>
  readonly milestones: ReadonlyArray<IAPIMilestone>
}

export class ProjectView extends React.Component<
  IProjectViewProps,
  IProjectViewState
> {
  public constructor(props: IProjectViewProps) {
    super(props)
    this.state = {
      projectDetails: null,
      isLoading: true,
      error: null,
      selectedViewId: null,
      viewOrder: [],
      draggedViewId: null,
      dragOverViewId: null,
      selectedItem: null,
      showCreateDialog: false,
      createDialogInitialStatusId: undefined,
      collaborators: [],
      labels: [],
      milestones: [],
    }
  }

  public async componentDidMount() {
    await this.loadProjectDetails()
  }

  private getStorageKey(): string {
    return `${ViewOrderStorageKey}-${this.props.project.id}`
  }

  private loadViewOrder(): ReadonlyArray<string> | null {
    try {
      const stored = localStorage.getItem(this.getStorageKey())
      if (stored) {
        return JSON.parse(stored)
      }
    } catch (e) {
      // Ignore parse errors
    }
    return null
  }

  private saveViewOrder(order: ReadonlyArray<string>): void {
    try {
      localStorage.setItem(this.getStorageKey(), JSON.stringify(order))
    } catch (e) {
      // Ignore storage errors
    }
  }

  private mergeViewOrder(
    apiViews: ReadonlyArray<IAPIProjectV2View>,
    savedOrder: ReadonlyArray<string> | null
  ): ReadonlyArray<string> {
    if (!savedOrder) {
      return apiViews.map(v => v.id)
    }

    // Start with saved order, but only include views that still exist
    const apiViewIds = new Set(apiViews.map(v => v.id))
    const merged: string[] = []

    // Add saved views that still exist in order
    for (const id of savedOrder) {
      if (apiViewIds.has(id)) {
        merged.push(id)
        apiViewIds.delete(id)
      }
    }

    // Add any new views from API that weren't in saved order
    for (const id of apiViewIds) {
      merged.push(id)
    }

    return merged
  }

  public async componentDidUpdate(prevProps: IProjectViewProps) {
    if (prevProps.project.id !== this.props.project.id) {
      await this.loadProjectDetails()
    }
  }

  private async loadProjectDetails() {
    this.setState({ isLoading: true, error: null })

    try {
      const api = API.fromAccount(this.props.account)
      const details = await api.fetchProjectDetails(this.props.project.id)

      if (details) {
        // Load saved order from localStorage, merge with API views
        const savedOrder = this.loadViewOrder()
        const viewOrder = this.mergeViewOrder(details.views, savedOrder)

        // Select first view in the merged order
        const firstViewId = viewOrder.length > 0 ? viewOrder[0] : null

        this.setState({
          projectDetails: details,
          selectedViewId: firstViewId,
          viewOrder,
          isLoading: false,
        })
      } else {
        this.setState({
          error: 'Failed to load project details',
          isLoading: false,
        })
      }
    } catch (e) {
      this.setState({
        error: `Error loading project: ${e}`,
        isLoading: false,
      })
    }
  }

  private getOrderedViews(
    views: ReadonlyArray<IAPIProjectV2View>,
    order: ReadonlyArray<string>
  ): ReadonlyArray<IAPIProjectV2View> {
    const viewMap = new Map(views.map(v => [v.id, v]))
    const ordered: IAPIProjectV2View[] = []

    for (const id of order) {
      const view = viewMap.get(id)
      if (view) {
        ordered.push(view)
        viewMap.delete(id)
      }
    }

    // Add any remaining views not in order
    for (const view of viewMap.values()) {
      ordered.push(view)
    }

    return ordered
  }

  private onViewSelect = (viewId: string) => {
    this.setState({ selectedViewId: viewId })
  }

  private getSelectedView(): IAPIProjectV2View | null {
    const { projectDetails, selectedViewId } = this.state
    if (!projectDetails || !selectedViewId) {
      return null
    }
    return projectDetails.views.find(v => v.id === selectedViewId) ?? null
  }

  private getFilteredItems(): ReadonlyArray<IAPIProjectV2ItemWithContent> {
    const { projectDetails } = this.state
    const selectedView = this.getSelectedView()

    if (!projectDetails) {
      return []
    }

    // Filter out archived items by default
    let items = projectDetails.items.filter(item => !item.isArchived)

    // Apply the view's filter if present
    if (selectedView?.filter) {
      items = applyFilter(items, selectedView.filter, {
        currentUserLogin: this.props.account.login,
        projectFields: projectDetails.fields
      }) as IAPIProjectV2ItemWithContent[]
    }

    return items
  }

  private onCardClick = (item: IAPIProjectV2ItemWithContent) => {
    // Only open modal for Issues (not DraftIssues or PRs for now)
    if (item.content && item.content.type === 'Issue' && item.content.repository) {
      this.setState({ selectedItem: item })
    }
  }

  private onStatusChange = async (
    item: IAPIProjectV2ItemWithContent,
    newStatusOptionId: string,
    newStatusName: string
  ) => {
    const { projectDetails } = this.state
    const { project, account } = this.props

    if (!projectDetails) {
      return
    }

    // Find the status field
    const statusField = projectDetails.fields.find(f => f.name === 'Status')
    if (!statusField) {
      console.error('[onStatusChange] Status field not found')
      return
    }

    // Optimistic update - update the local state immediately
    const updatedItems = projectDetails.items.map(i => {
      if (i.id !== item.id) {
        return i
      }

      // Update the status field value in the item
      const updatedFieldValues = i.fieldValues.map(fv => {
        if (fv.field.name === 'Status' && fv.type === 'singleSelect') {
          return {
            ...fv,
            optionId: newStatusOptionId,
            name: newStatusName,
          }
        }
        return fv
      })

      // If no existing status field, add one
      const hasStatus = updatedFieldValues.some(fv => fv.field.name === 'Status')
      if (!hasStatus) {
        updatedFieldValues.push({
          type: 'singleSelect' as const,
          field: { name: 'Status' },
          optionId: newStatusOptionId,
          name: newStatusName,
        })
      }

      return {
        ...i,
        fieldValues: updatedFieldValues,
      }
    })

    this.setState({
      projectDetails: {
        ...projectDetails,
        items: updatedItems,
      },
    })

    // Call the API to update the status
    try {
      const api = API.fromAccount(account)
      const success = await api.updateProjectItemField(
        project.id,
        item.id,
        statusField.id,
        'SINGLE_SELECT',
        newStatusOptionId
      )

      if (!success) {
        console.error('[onStatusChange] Failed to update status')
        // Revert optimistic update on failure
        this.setState({ projectDetails })
      }
    } catch (e) {
      console.error('[onStatusChange] Error updating status:', e)
      // Revert optimistic update on error
      this.setState({ projectDetails })
    }
  }

  private onAddIssue = (statusOptionId: string, statusName: string) => {
    console.log('[ProjectView] onAddIssue called:', statusOptionId, statusName)
    console.log('[ProjectView] repository:', this.props.repository)
    this.setState({
      showCreateDialog: true,
      createDialogInitialStatusId: statusOptionId,
    })
  }

  private onCloseCreateDialog = () => {
    this.setState({
      showCreateDialog: false,
      createDialogInitialStatusId: undefined,
    })
  }

  private onLoadCreateDialogMetadata = async () => {
    const { repository, account } = this.props
    if (!repository?.gitHubRepository) {
      return
    }

    const api = API.fromAccount(account)
    const ghRepo = repository.gitHubRepository
    const owner = ghRepo.owner.login
    const name = ghRepo.name

    try {
      const [collaborators, labels, milestones] = await Promise.all([
        api.fetchCollaborators(owner, name),
        api.fetchLabels(owner, name),
        api.fetchMilestones(owner, name),
      ])

      this.setState({
        collaborators: collaborators || [],
        labels: labels || [],
        milestones: milestones || [],
      })
    } catch (e) {
      console.error('Failed to load repository metadata:', e)
    }
  }

  private onCreateTask = async (
    title: string,
    body: string,
    assignees: ReadonlyArray<string>,
    labels: ReadonlyArray<string>,
    milestone: number | undefined,
    _projectId: string | undefined,
    statusOptionId: string | undefined,
    iterationId: string | undefined
  ) => {
    const { repository, account, project } = this.props
    const { projectDetails } = this.state

    if (!repository?.gitHubRepository || !projectDetails) {
      throw new Error('Repository or project details not available')
    }

    const api = API.fromAccount(account)
    const ghRepo = repository.gitHubRepository
    const owner = ghRepo.owner.login
    const name = ghRepo.name

    // 1. Create the issue in the repository
    const issue = await api.createIssue(
      owner,
      name,
      title,
      body,
      assignees,
      labels,
      milestone
    )

    if (!issue) {
      throw new Error('Failed to create issue')
    }

    // 2. Get the issue's node ID for GraphQL operations
    const issueNodeId = await api.fetchIssueNodeId(owner, name, issue.number)
    if (!issueNodeId) {
      throw new Error('Failed to get issue node ID')
    }

    // 3. Add the issue to the project
    const projectItemId = await api.addIssueToProject(project.id, issueNodeId)
    if (!projectItemId) {
      throw new Error('Failed to add issue to project')
    }

    // 4. Set the status if specified
    if (statusOptionId) {
      const statusField = projectDetails.fields.find(f => f.name === 'Status')
      if (statusField) {
        await api.updateProjectItemField(
          project.id,
          projectItemId,
          statusField.id,
          'SINGLE_SELECT',
          statusOptionId
        )
      }
    }

    // 5. Set the iteration if specified
    if (iterationId) {
      const iterationField = projectDetails.fields.find(
        f => f.dataType === 'ITERATION'
      )
      if (iterationField) {
        await api.updateProjectItemField(
          project.id,
          projectItemId,
          iterationField.id,
          'ITERATION',
          iterationId
        )
      }
    }

    // 6. Refresh the project to show the new item
    await this.loadProjectDetails()
  }

  private onCloseModal = () => {
    this.setState({ selectedItem: null })
  }

  private onOpenInBrowser = () => {
    const { selectedItem } = this.state
    if (selectedItem?.content?.url) {
      shell.openExternal(selectedItem.content.url)
    }
  }

  private convertToIssueInfo(item: IAPIProjectV2ItemWithContent): IIssueInfo | null {
    const content = item.content
    if (!content || !content.repository) {
      return null
    }

    // Get status from field values
    const statusValue = item.fieldValues.find(
      fv => fv.field.name === 'Status' && fv.type === 'singleSelect'
    )
    const projectStatus = statusValue?.type === 'singleSelect' ? statusValue.name || null : null

    return {
      issueId: content.id,
      issueNumber: content.number ?? 0,
      title: content.title,
      body: null, // Will be fetched by IssueDetailView
      authorLogin: null, // Will be fetched by IssueDetailView
      authorAvatarUrl: null, // Will be fetched by IssueDetailView
      createdAt: null, // Will be fetched by IssueDetailView
      repositoryName: `${content.repository.owner.login}/${content.repository.name}`,
      url: content.url ?? '',
      state: content.state === 'CLOSED' ? 'CLOSED' : 'OPEN',
      labels: content.labels ?? [],
      projectStatus,
      projectTitle: this.props.project.title,
    }
  }

  private renderIssueModal() {
    const { selectedItem, projectDetails } = this.state
    const { account, project } = this.props

    if (!selectedItem || !selectedItem.content?.repository) {
      return null
    }

    const issueInfo = this.convertToIssueInfo(selectedItem)
    if (!issueInfo) {
      return null
    }

    const owner = selectedItem.content.repository.owner.login
    const repo = selectedItem.content.repository.name

    // Get projects list for the dropdown
    const projects: IAPIProjectV2[] = projectDetails ? [{
      id: project.id,
      number: project.number,
      title: project.title,
      url: project.url,
      fields: projectDetails.fields,
    }] : []

    return (
      <div className="issue-modal-overlay" onClick={this.onCloseModal}>
        <div className="issue-modal-content" onClick={e => e.stopPropagation()}>
          <IssueDetailView
            owner={owner}
            repo={repo}
            issue={issueInfo}
            account={account}
            projects={projects}
            onBack={this.onCloseModal}
            onOpenInBrowser={this.onOpenInBrowser}
          />
        </div>
      </div>
    )
  }

  private onDragStart = (e: React.DragEvent<HTMLDivElement>, viewId: string) => {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', viewId)
    this.setState({ draggedViewId: viewId })
  }

  private onDragOver = (e: React.DragEvent<HTMLDivElement>, viewId: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'

    if (this.state.dragOverViewId !== viewId) {
      this.setState({ dragOverViewId: viewId })
    }
  }

  private onDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    // Only clear if we're actually leaving the element
    const relatedTarget = e.relatedTarget as HTMLElement
    if (!e.currentTarget.contains(relatedTarget)) {
      this.setState({ dragOverViewId: null })
    }
  }

  private onDrop = (e: React.DragEvent<HTMLDivElement>, targetViewId: string) => {
    e.preventDefault()
    const { draggedViewId, viewOrder } = this.state

    if (!draggedViewId || draggedViewId === targetViewId) {
      this.setState({ draggedViewId: null, dragOverViewId: null })
      return
    }

    const newOrder = [...viewOrder]
    const draggedIndex = newOrder.indexOf(draggedViewId)
    const targetIndex = newOrder.indexOf(targetViewId)

    if (draggedIndex !== -1 && targetIndex !== -1) {
      // Remove dragged item and insert at target position
      newOrder.splice(draggedIndex, 1)
      newOrder.splice(targetIndex, 0, draggedViewId)

      // Persist to localStorage
      this.saveViewOrder(newOrder)

      this.setState({
        viewOrder: newOrder,
        draggedViewId: null,
        dragOverViewId: null,
      })
    } else {
      this.setState({ draggedViewId: null, dragOverViewId: null })
    }
  }

  private onDragEnd = () => {
    this.setState({ draggedViewId: null, dragOverViewId: null })
  }

  private renderViewTabs() {
    const { projectDetails, selectedViewId, viewOrder, draggedViewId, dragOverViewId } = this.state
    if (!projectDetails) {
      return null
    }

    const orderedViews = this.getOrderedViews(projectDetails.views, viewOrder)

    return (
      <div className="project-view-tabs">
        {orderedViews.map(view => {
          const isSelected = view.id === selectedViewId
          const isDragging = view.id === draggedViewId
          const isDragOver = view.id === dragOverViewId

          return (
            <div
              key={view.id}
              className={`view-tab-container ${isSelected ? 'selected' : ''} ${isDragging ? 'dragging' : ''} ${isDragOver ? 'drag-over' : ''}`}
              draggable={true}
              onDragStart={(e) => this.onDragStart(e, view.id)}
              onDragOver={(e) => this.onDragOver(e, view.id)}
              onDragLeave={this.onDragLeave}
              onDrop={(e) => this.onDrop(e, view.id)}
              onDragEnd={this.onDragEnd}
            >
              <button
                className={`view-tab ${isSelected ? 'selected' : ''}`}
                onClick={() => this.onViewSelect(view.id)}
              >
                <Octicon symbol={octicons.grabber} className="drag-handle" />
                <Octicon symbol={this.getViewIcon(view.layout)} />
                <span className="view-name">{view.name}</span>
              </button>
              {isSelected && (
                <ViewOptionsDropdown
                  view={view}
                  allFields={projectDetails.fields}
                />
              )}
            </div>
          )
        })}
      </div>
    )
  }

  private getViewIcon(layout: ProjectViewLayout) {
    switch (layout) {
      case 'BOARD_LAYOUT':
        return octicons.project
      case 'TABLE_LAYOUT':
        return octicons.table
      case 'ROADMAP_LAYOUT':
        return octicons.calendar
      default:
        return octicons.project
    }
  }

  private renderViewContent() {
    const { projectDetails, isLoading, error } = this.state
    const selectedView = this.getSelectedView()

    if (isLoading) {
      return (
        <div className="project-view-loading">
          <Octicon symbol={octicons.sync} className="spin" />
          <span>Loading project...</span>
        </div>
      )
    }

    if (error) {
      return (
        <div className="project-view-error">
          <Octicon symbol={octicons.alert} />
          <span>{error}</span>
        </div>
      )
    }

    if (!projectDetails || !selectedView) {
      return (
        <div className="project-view-empty">
          <span>No views available</span>
        </div>
      )
    }

    const items = this.getFilteredItems()
    const statusField = projectDetails.fields.find(f => f.name === 'Status')

    switch (selectedView.layout) {
      case 'BOARD_LAYOUT':
        return (
          <BoardLayout
            items={items}
            fields={projectDetails.fields}
            statusField={statusField}
            groupByField={selectedView.groupBy?.[0]}
            onCardClick={this.onCardClick}
            onStatusChange={this.onStatusChange}
            onAddIssue={this.onAddIssue}
          />
        )
      case 'TABLE_LAYOUT':
        return (
          <TableLayout
            items={items}
            fields={projectDetails.fields}
            visibleFields={selectedView.visibleFields}
            onRowClick={this.onCardClick}
          />
        )
      case 'ROADMAP_LAYOUT':
        return (
          <div className="project-view-roadmap-placeholder">
            <Octicon symbol={octicons.calendar} />
            <span>Roadmap view coming soon</span>
          </div>
        )
      default:
        return null
    }
  }

  private renderHeader() {
    const { project, onClose } = this.props

    return (
      <div className="project-view-header">
        <div className="project-title">
          <Octicon symbol={octicons.project} />
          <h2>{project.title}</h2>
        </div>
        <button className="close-button" onClick={onClose} title="Close project view">
          <Octicon symbol={octicons.x} />
        </button>
      </div>
    )
  }

  private renderCreateDialog() {
    const { showCreateDialog, createDialogInitialStatusId, projectDetails, collaborators, labels, milestones } = this.state
    const { repository, project } = this.props

    console.log('[ProjectView] renderCreateDialog - showCreateDialog:', showCreateDialog, 'repository:', repository?.gitHubRepository?.fullName)

    if (!showCreateDialog || !repository?.gitHubRepository) {
      return null
    }

    const ghRepo = repository.gitHubRepository

    // Build projects array with fields for status dropdown
    const projects: IAPIProjectV2[] = projectDetails ? [{
      id: project.id,
      number: project.number,
      title: project.title,
      url: project.url,
      fields: projectDetails.fields,
    }] : []

    // Find the current iteration to pre-select
    let initialIterationId: string | undefined
    if (projectDetails) {
      const iterationField = projectDetails.fields.find(f => f.dataType === 'ITERATION')
      if (iterationField?.configuration?.iterations) {
        const now = new Date()
        const currentIteration = iterationField.configuration.iterations.find(iter => {
          const start = new Date(iter.startDate)
          const durationDays = iter.duration
          const end = new Date(start)
          end.setDate(end.getDate() + durationDays)
          return now >= start && now <= end
        })
        initialIterationId = currentIteration?.id
      }
    }

    console.log('[ProjectView] RENDERING CreateTaskDialog with:', {
      owner: ghRepo.owner.login,
      repoName: ghRepo.name,
      initialProjectId: project.id,
      initialStatusOptionId: createDialogInitialStatusId,
      initialIterationId,
    })

    return (
      <DialogStackContext.Provider value={{ isTopMost: true }}>
        <CreateTaskDialog
          owner={ghRepo.owner.login}
          repoName={ghRepo.name}
          collaborators={collaborators}
          labels={labels}
          milestones={milestones}
          projects={projects}
          onDismissed={this.onCloseCreateDialog}
          onLoad={this.onLoadCreateDialogMetadata}
          onCreateTask={this.onCreateTask}
          initialProjectId={project.id}
          initialStatusOptionId={createDialogInitialStatusId}
          initialIterationId={initialIterationId}
        />
      </DialogStackContext.Provider>
    )
  }

  public render() {
    return (
      <div className="project-view">
        {this.renderHeader()}
        {this.renderViewTabs()}
        <div className="project-view-content">
          {this.renderViewContent()}
        </div>
        {this.renderIssueModal()}
        {this.renderCreateDialog()}
      </div>
    )
  }
}
