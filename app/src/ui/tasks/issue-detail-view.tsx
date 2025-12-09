import * as React from 'react'
import { ITask } from '../../lib/databases/tasks-database'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import classNames from 'classnames'
import {
  API,
  IAPIIdentity,
  IAPILabel,
  IAPIMilestone,
  IAPIProjectV2,
  IAPIProjectFieldValue,
  IAPIIssueTimelineEvent,
} from '../../lib/api'
import { Account } from '../../models/account'

/** Comment from GitHub API */
export interface IIssueComment {
  readonly id: number
  readonly body: string
  readonly user: IAPIIdentity
  readonly createdAt: string
}

/** Project info for the issue detail panel */
export interface IProjectInfo {
  /** The project item ID (links issue to project) */
  readonly itemId: string
  /** The project ID */
  readonly projectId: string
  /** The project title */
  readonly projectTitle: string
  /** Whether the project item is archived */
  readonly isArchived: boolean
  /** The status field ID */
  readonly statusFieldId: string
  /** Current status option ID */
  readonly currentStatusOptionId: string | null
  /** Current status name */
  readonly currentStatusName: string | null
  /** Available status options */
  readonly statusOptions: ReadonlyArray<{ id: string; name: string }>
  /** All current field values for this project item */
  readonly fieldValues: ReadonlyArray<IAPIProjectFieldValue>
}

/** Full issue details for display */
export interface IIssueDetails {
  readonly comments: ReadonlyArray<IIssueComment>
  /** Full timeline events (includes comments, labels, assignments, etc.) */
  readonly timeline: ReadonlyArray<IAPIIssueTimelineEvent>
  readonly assignees: ReadonlyArray<IAPIIdentity>
  readonly availableAssignees: ReadonlyArray<IAPIIdentity>
  readonly availableLabels: ReadonlyArray<IAPILabel>
  readonly availableMilestones: ReadonlyArray<IAPIMilestone>
  readonly milestone: IAPIMilestone | null
  /** Project info (if issue is in a project) */
  readonly projectInfo: IProjectInfo | null
}

/** Minimal issue info needed to display the view */
export interface IIssueInfo {
  /** GitHub node ID for the issue (required for GraphQL operations) */
  readonly issueId: string
  /** Issue number */
  readonly issueNumber: number
  /** Issue title */
  readonly title: string
  /** Issue body/description (markdown) */
  readonly body: string | null
  /** Author login name */
  readonly authorLogin: string | null
  /** Author avatar URL */
  readonly authorAvatarUrl: string | null
  /** ISO timestamp of when the issue was created */
  readonly createdAt: string | null
  /** Repository in owner/repo format */
  readonly repositoryName: string
  /** URL to the issue on GitHub */
  readonly url: string
  /** Issue state */
  readonly state: 'OPEN' | 'CLOSED'
  /** Labels attached to the issue */
  readonly labels: ReadonlyArray<{ name: string; color: string }>
  /** Status from linked project (if any) - pre-populated for tasks */
  readonly projectStatus: string | null
  /** Title of the linked project (if any) - pre-populated for tasks */
  readonly projectTitle: string | null
}

interface IIssueDetailViewProps {
  /** Repository owner (e.g., 'octocat') */
  readonly owner: string

  /** Repository name (e.g., 'Hello-World') */
  readonly repo: string

  /** The issue info to display */
  readonly issue: IIssueInfo

  /** The account to use for API calls */
  readonly account: Account

  /** Available GitHub Projects V2 for this repository */
  readonly projects: ReadonlyArray<IAPIProjectV2>

  /** Called when the back button is clicked */
  readonly onBack: () => void

  /** Called when the user wants to open the issue in browser */
  readonly onOpenInBrowser: () => void

  /** Optional: Task-specific features */
  readonly taskFeatures?: {
    /** The full task object (for pin/active features) */
    readonly task: ITask
    /** Whether this is the currently active task */
    readonly isActive: boolean
    /** Called when the pin button is clicked */
    readonly onPin: () => void
    /** Called when the start/stop button is clicked */
    readonly onActivate: () => void
  }

  /** Optional: Called when the issue state is updated (for parent to refresh) */
  readonly onIssueUpdated?: () => void
}

interface IIssueDetailViewState {
  /** Loaded issue details */
  readonly issueDetails: IIssueDetails | null
  /** Whether details are being loaded */
  readonly isLoadingDetails: boolean
  /** Current issue info (may be updated after API calls) */
  readonly currentIssue: IIssueInfo
  /** Comment form state */
  readonly newComment: string
  readonly isSubmittingComment: boolean
  /** Dropdown visibility states */
  readonly showAssigneeDropdown: boolean
  readonly showLabelDropdown: boolean
  readonly showMilestoneDropdown: boolean
  readonly showProjectStatusDropdown: boolean
}

/**
 * Self-contained issue detail view component.
 * Fetches all its own data and handles all API operations internally.
 * Can be used from both Tasks and Issues tabs.
 */
export class IssueDetailView extends React.Component<
  IIssueDetailViewProps,
  IIssueDetailViewState
> {
  private api: API

  public constructor(props: IIssueDetailViewProps) {
    super(props)
    this.api = new API(props.account.endpoint, props.account.token)
    this.state = {
      issueDetails: null,
      isLoadingDetails: true,
      currentIssue: props.issue,
      newComment: '',
      isSubmittingComment: false,
      showAssigneeDropdown: false,
      showLabelDropdown: false,
      showMilestoneDropdown: false,
      showProjectStatusDropdown: false,
    }
  }

  public componentDidMount() {
    this.loadIssueDetails()
  }

  public componentDidUpdate(prevProps: IIssueDetailViewProps) {
    // Reload if the issue changes
    if (prevProps.issue.issueNumber !== this.props.issue.issueNumber ||
        prevProps.owner !== this.props.owner ||
        prevProps.repo !== this.props.repo) {
      this.api = new API(this.props.account.endpoint, this.props.account.token)
      this.setState({
        issueDetails: null,
        isLoadingDetails: true,
        currentIssue: this.props.issue,
      })
      this.loadIssueDetails()
    }
  }

  private async loadIssueDetails() {
    const { owner, repo, issue, projects } = this.props

    try {
      // Fetch all data in parallel
      const [commentsData, timelineData, collaborators, labels, milestones, issueData] = await Promise.all([
        this.api.fetchIssueComments(owner, repo, String(issue.issueNumber)),
        this.api.fetchIssueTimeline(owner, repo, issue.issueNumber),
        this.api.fetchCollaborators(owner, repo),
        this.api.fetchLabels(owner, repo),
        this.api.fetchMilestones(owner, repo),
        this.api.fetchIssue(owner, repo, issue.issueNumber),
      ])

      const comments = commentsData.map(c => ({
        id: c.id,
        body: c.body,
        user: c.user,
        createdAt: c.created_at,
      }))

      // Fetch project info if the repository has projects
      let projectInfo: IProjectInfo | null = null
      if (projects.length > 0) {
        try {
          const projectItems = await this.api.fetchIssueProjectItems(owner, repo, issue.issueNumber)

          // Use the first project item (or match issue.projectTitle if set)
          const projectItem = issue.projectTitle
            ? projectItems.find(item => item.project.title === issue.projectTitle)
            : projectItems[0]

          if (projectItem) {
            const project = projects.find(p => p.id === projectItem.project.id)

            if (project) {
              // Find the Status field and its options
              const statusField = project.fields?.find(
                f => f.name === 'Status' && f.dataType === 'SINGLE_SELECT'
              )

              if (statusField) {
                // Extract current status from fieldValues
                const statusFieldValue = projectItem.fieldValues.find(
                  fv => fv.field?.name === 'Status' && fv.type === 'singleSelect'
                )

                projectInfo = {
                  itemId: projectItem.id,
                  projectId: project.id,
                  projectTitle: project.title,
                  isArchived: projectItem.isArchived,
                  statusFieldId: statusField.id,
                  currentStatusOptionId: statusFieldValue?.type === 'singleSelect' ? statusFieldValue.optionId : null,
                  currentStatusName: statusFieldValue?.type === 'singleSelect' ? statusFieldValue.name : null,
                  statusOptions: statusField.options || [],
                  fieldValues: projectItem.fieldValues,
                }
              }
            }
          }
        } catch (e) {
          console.warn('Failed to fetch project info', e)
        }
      }

      // Update current issue with fresh data from API
      const updatedIssue: IIssueInfo = {
        ...this.state.currentIssue,
        title: issueData.title,
        body: issueData.body,
        state: issueData.state === 'open' ? 'OPEN' : 'CLOSED',
        labels: issueData.labels?.map(l => ({
          name: typeof l === 'string' ? l : l.name || '',
          color: typeof l === 'string' ? '000000' : l.color || '000000',
        })) || [],
      }

      const issueDetails: IIssueDetails = {
        comments,
        timeline: timelineData,
        assignees: issueData.assignees || [],
        availableAssignees: collaborators,
        availableLabels: labels,
        availableMilestones: milestones,
        milestone: issueData.milestone || null,
        projectInfo,
      }

      this.setState({
        issueDetails,
        isLoadingDetails: false,
        currentIssue: updatedIssue,
      })
    } catch (e) {
      console.warn('Failed to load issue details', e)
      this.setState({ isLoadingDetails: false })
    }
  }

  public render() {
    const { taskFeatures } = this.props
    const { currentIssue } = this.state

    return (
      <div className="task-detail-panel">
        <header className="task-detail-header">
          <button
            className="back-button"
            onClick={this.props.onBack}
            title="Back to list"
          >
            <Octicon symbol={octicons.arrowLeft} />
          </button>
          <div className="task-header-info">
            <span className="task-repo">{currentIssue.repositoryName}</span>
          </div>
          <div className="task-detail-actions">
            {taskFeatures && (
              <>
                <button
                  className={classNames('action-button', { active: taskFeatures.task.isPinned })}
                  onClick={taskFeatures.onPin}
                  title={taskFeatures.task.isPinned ? 'Unpin' : 'Pin to top'}
                >
                  <Octicon symbol={taskFeatures.task.isPinned ? octicons.pinSlash : octicons.pin} />
                </button>
                <button
                  className={classNames('action-button', { active: taskFeatures.isActive })}
                  onClick={taskFeatures.onActivate}
                  title={taskFeatures.isActive ? 'Stop working' : 'Start working'}
                >
                  <Octicon symbol={taskFeatures.isActive ? octicons.square : octicons.play} />
                </button>
              </>
            )}
            <button
              className="action-button"
              onClick={this.props.onOpenInBrowser}
              title="Open in browser"
            >
              <Octicon symbol={octicons.linkExternal} />
            </button>
          </div>
        </header>

        <div className="task-detail-layout">
          <div className="task-detail-main">
            {this.renderMainContent()}
          </div>
          <div className="task-detail-sidebar">
            {this.renderSidebar()}
          </div>
        </div>
      </div>
    )
  }

  private renderMainContent() {
    const { currentIssue, issueDetails, isLoadingDetails } = this.state

    return (
      <>
        {/* Title and status */}
        <div className="task-title-section">
          <h1 className="task-detail-title">
            {currentIssue.title}
            <span className="task-number"> #{currentIssue.issueNumber}</span>
          </h1>
          <div className="task-status-row">
            <span className={classNames('task-state-badge', currentIssue.state.toLowerCase())}>
              <Octicon symbol={currentIssue.state === 'OPEN' ? octicons.issueOpened : octicons.issueClosed} />
              {currentIssue.state === 'OPEN' ? 'Open' : 'Closed'}
            </span>
            {currentIssue.authorLogin && (
              <span className="task-opened-by">
                <strong>{currentIssue.authorLogin}</strong> opened this issue{' '}
                {currentIssue.createdAt && this.formatDate(currentIssue.createdAt)}
              </span>
            )}
          </div>
        </div>

        {/* Issue body */}
        <div className="task-body-section">
          <div className="comment-container first-comment">
            {currentIssue.authorAvatarUrl && (
              <img
                src={currentIssue.authorAvatarUrl}
                alt={currentIssue.authorLogin || ''}
                className="comment-avatar"
              />
            )}
            <div className="comment-content">
              <div className="comment-header">
                <span className="comment-author">{currentIssue.authorLogin}</span>
                <span className="comment-date">
                  commented {currentIssue.createdAt && this.formatDate(currentIssue.createdAt)}
                </span>
              </div>
              <div className="comment-body markdown-body">
                {currentIssue.body ? (
                  this.renderMarkdown(currentIssue.body)
                ) : (
                  <p className="no-description">No description provided.</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Timeline section - shows all events */}
        <div className="task-timeline-section">
          {isLoadingDetails && (
            <div className="loading-timeline">
              <Octicon symbol={octicons.sync} className="spin" />
              Loading timeline...
            </div>
          )}

          {issueDetails?.timeline.map((event, index) =>
            this.renderTimelineEvent(event, index)
          )}

          {/* Add comment form */}
          <div className="add-comment-section">
            <div className="comment-form">
              <h3>Add a comment</h3>
              <textarea
                className="comment-textarea"
                placeholder="Leave a comment"
                value={this.state.newComment}
                onChange={this.onCommentChange}
                rows={4}
              />
              <div className="comment-form-actions">
                <button
                  className={classNames('close-issue-button', {
                    reopen: currentIssue.state !== 'OPEN',
                  })}
                  onClick={this.onToggleState}
                >
                  <Octicon
                    symbol={
                      currentIssue.state === 'OPEN'
                        ? octicons.issueClosed
                        : octicons.issueReopened
                    }
                  />
                  {currentIssue.state === 'OPEN' ? 'Close issue' : 'Reopen issue'}
                </button>
                <button
                  className="submit-comment-button"
                  onClick={this.onSubmitComment}
                  disabled={
                    !this.state.newComment.trim() ||
                    this.state.isSubmittingComment
                  }
                >
                  Comment
                </button>
              </div>
            </div>
          </div>
        </div>
      </>
    )
  }

  private renderSidebar() {
    const { projects } = this.props
    const { currentIssue, issueDetails } = this.state

    return (
      <>
        {/* Assignees */}
        <div className="sidebar-section">
          <div className="sidebar-section-header">
            <span>Assignees</span>
            <button
              className="sidebar-edit-button"
              onClick={this.toggleAssigneeDropdown}
            >
              <Octicon symbol={octicons.gear} />
            </button>
          </div>
          <div className="sidebar-section-content">
            {this.state.showAssigneeDropdown && this.renderAssigneeDropdown()}
            {issueDetails?.assignees.length ? (
              issueDetails.assignees.map(assignee => (
                <div key={assignee.id} className="assignee-item">
                  <img
                    src={assignee.avatar_url}
                    alt={assignee.login}
                    className="assignee-avatar"
                  />
                  <span className="assignee-name">{assignee.login}</span>
                </div>
              ))
            ) : (
              <span className="no-value">No one assigned</span>
            )}
          </div>
        </div>

        {/* Labels */}
        <div className="sidebar-section">
          <div className="sidebar-section-header">
            <span>Labels</span>
            <button
              className="sidebar-edit-button"
              onClick={this.toggleLabelDropdown}
            >
              <Octicon symbol={octicons.gear} />
            </button>
          </div>
          <div className="sidebar-section-content">
            {this.state.showLabelDropdown && this.renderLabelDropdown()}
            {currentIssue.labels.length ? (
              <div className="label-list">
                {currentIssue.labels.map(label => (
                  <span
                    key={label.name}
                    className="label-badge"
                    style={{ backgroundColor: `#${label.color}` }}
                  >
                    {label.name}
                  </span>
                ))}
              </div>
            ) : (
              <span className="no-value">None yet</span>
            )}
          </div>
        </div>

        {/* Projects */}
        <div className="sidebar-section">
          <div className="sidebar-section-header">
            <span>Projects</span>
            {projects.length > 0 && (
              <button
                className="sidebar-edit-button"
                onClick={this.toggleProjectStatusDropdown}
                title="Add to project"
              >
                <Octicon symbol={octicons.gear} />
              </button>
            )}
          </div>
          <div className="sidebar-section-content">
            {this.state.showProjectStatusDropdown &&
              this.renderProjectStatusDropdown()}
            {currentIssue.projectTitle || issueDetails?.projectInfo ? (
              <div className="project-item-with-fields">
                <div className="project-name-row">
                  <Octicon symbol={octicons.project} />
                  <span className="project-title">{currentIssue.projectTitle || issueDetails?.projectInfo?.projectTitle}</span>
                  {issueDetails?.projectInfo?.isArchived && (
                    <span className="archived-badge" title="This item is archived in the project">
                      <Octicon symbol={octicons.archive} />
                      Archived
                    </span>
                  )}
                </div>
                {this.renderProjectFields()}
              </div>
            ) : (
              <span className="no-value">None yet</span>
            )}
          </div>
        </div>

        {/* Milestone */}
        <div className="sidebar-section">
          <div className="sidebar-section-header">
            <span>Milestone</span>
            <button
              className="sidebar-edit-button"
              onClick={this.toggleMilestoneDropdown}
            >
              <Octicon symbol={octicons.gear} />
            </button>
          </div>
          <div className="sidebar-section-content">
            {this.state.showMilestoneDropdown && this.renderMilestoneDropdown()}
            {issueDetails?.milestone ? (
              <div className="milestone-item">
                <Octicon symbol={octicons.milestone} />
                <span className="milestone-title">
                  {issueDetails.milestone.title}
                </span>
              </div>
            ) : (
              <span className="no-value">No milestone</span>
            )}
          </div>
        </div>

        {/* Task-specific features: Time tracking */}
        {this.props.taskFeatures?.task.timeSpent ? (
          <div className="sidebar-section">
            <div className="sidebar-section-header">
              <span>Time Tracked</span>
            </div>
            <div className="sidebar-section-content">
              <span className="time-value">
                <Octicon symbol={octicons.clock} />
                {Math.floor(this.props.taskFeatures.task.timeSpent / 60)}h{' '}
                {this.props.taskFeatures.task.timeSpent % 60}m
              </span>
            </div>
          </div>
        ) : null}

        {/* Task-specific features: Personal notes */}
        {this.props.taskFeatures?.task.notes && (
          <div className="sidebar-section">
            <div className="sidebar-section-header">
              <span>Personal Notes</span>
            </div>
            <div className="sidebar-section-content">
              <div className="notes-content">{this.props.taskFeatures.task.notes}</div>
            </div>
          </div>
        )}
      </>
    )
  }

  private renderAssigneeDropdown() {
    const { issueDetails } = this.state
    if (!issueDetails) return null

    const currentLogins = new Set(
      issueDetails.assignees.map(a => a.login)
    )

    return (
      <div className="dropdown-menu assignee-dropdown">
        <div className="dropdown-header">Assign up to 10 people</div>
        {issueDetails.availableAssignees.map(user => (
          <label key={user.id} className="dropdown-item">
            <input
              type="checkbox"
              checked={currentLogins.has(user.login)}
              onChange={() => this.onToggleAssignee(user.login)}
            />
            <img
              src={user.avatar_url}
              alt={user.login}
              className="dropdown-avatar"
            />
            <span>{user.login}</span>
          </label>
        ))}
      </div>
    )
  }

  private renderLabelDropdown() {
    const { currentIssue, issueDetails } = this.state
    if (!issueDetails) return null

    const currentLabels = new Set(currentIssue.labels.map(l => l.name))

    return (
      <div className="dropdown-menu label-dropdown">
        <div className="dropdown-header">Apply labels to this issue</div>
        {issueDetails.availableLabels.map(label => (
          <label key={label.name} className="dropdown-item">
            <input
              type="checkbox"
              checked={currentLabels.has(label.name)}
              onChange={() => this.onToggleLabel(label.name)}
            />
            <span
              className="label-color-dot"
              style={{ backgroundColor: `#${label.color}` }}
            />
            <span>{label.name}</span>
          </label>
        ))}
      </div>
    )
  }

  private renderMilestoneDropdown() {
    const { issueDetails } = this.state
    if (!issueDetails) return null

    return (
      <div className="dropdown-menu milestone-dropdown">
        <div className="dropdown-header">Set milestone</div>
        <label className="dropdown-item">
          <input
            type="radio"
            name="milestone"
            checked={issueDetails.milestone === null}
            onChange={() => this.onUpdateMilestone(null)}
          />
          <span>No milestone</span>
        </label>
        {issueDetails.availableMilestones.map(milestone => (
          <label key={milestone.id} className="dropdown-item">
            <input
              type="radio"
              name="milestone"
              checked={issueDetails.milestone?.id === milestone.id}
              onChange={() => this.onUpdateMilestone(milestone.number)}
            />
            <span>{milestone.title}</span>
          </label>
        ))}
      </div>
    )
  }

  private renderProjectStatusDropdown() {
    const { projects } = this.props
    const { currentIssue, issueDetails } = this.state

    if (projects.length === 0) {
      return (
        <div className="dropdown-menu project-status-dropdown">
          <div className="dropdown-header">Projects</div>
          <div className="dropdown-item loading">No projects available</div>
        </div>
      )
    }

    // Find the project that matches this issue's projectTitle (if any)
    const currentProject = currentIssue.projectTitle
      ? projects.find(p => p.title === currentIssue.projectTitle)
      : null

    const currentStatusName = issueDetails?.projectInfo?.currentStatusName || currentIssue.projectStatus

    // Other projects (ones this issue is not in)
    const otherProjects = currentProject
      ? projects.filter(p => p.id !== currentProject.id)
      : projects

    // If issue is in a project, show current project with status options
    if (currentProject) {
      const statusField = currentProject.fields.find(
        f => f.name === 'Status' && f.dataType === 'SINGLE_SELECT'
      )

      return (
        <div className="dropdown-menu project-status-dropdown">
          {/* Current project section */}
          <div className="dropdown-section">
            <div className="dropdown-header">
              <Octicon symbol={octicons.project} />
              <span className="current-project-name">{currentProject.title}</span>
            </div>
            {statusField?.options ? (
              statusField.options.map(option => (
                <label key={option.id} className="dropdown-item">
                  <input
                    type="radio"
                    name="project-status"
                    checked={option.name === currentStatusName}
                    onChange={() => this.onSelectProjectStatusFromField(
                      currentProject.id,
                      statusField.id,
                      option.id
                    )}
                  />
                  {option.color && (
                    <span
                      className="status-color-dot"
                      style={{ backgroundColor: this.getStatusColor(option.color) }}
                    />
                  )}
                  <span>{option.name}</span>
                </label>
              ))
            ) : (
              <div className="dropdown-item disabled">No status options</div>
            )}
          </div>

          {/* Other projects section - allow adding to additional projects */}
          {otherProjects.length > 0 && (
            <div className="dropdown-section">
              <div className="dropdown-header">Add to another project</div>
              {otherProjects.map(project => {
                const projectStatusField = project.fields.find(
                  f => f.name === 'Status' && f.dataType === 'SINGLE_SELECT'
                )
                return (
                  <div key={project.id} className="dropdown-item project-option">
                    <span className="project-name">{project.title}</span>
                    {projectStatusField?.options && (
                      <select
                        className="status-select"
                        onChange={(e) => this.onAddToProjectWithStatus(
                          project.id,
                          projectStatusField.id,
                          e.target.value
                        )}
                        defaultValue=""
                      >
                        <option value="" disabled>Select status...</option>
                        {projectStatusField.options.map(opt => (
                          <option key={opt.id} value={opt.id}>{opt.name}</option>
                        ))}
                      </select>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )
    }

    // Issue is not in a project - show list of projects to add to
    return (
      <div className="dropdown-menu project-status-dropdown">
        <div className="dropdown-header">Add to project</div>
        {projects.map(project => {
          const statusField = project.fields.find(
            f => f.name === 'Status' && f.dataType === 'SINGLE_SELECT'
          )
          return (
            <div key={project.id} className="dropdown-item project-option">
              <span className="project-name">{project.title}</span>
              {statusField?.options && (
                <select
                  className="status-select"
                  onChange={(e) => this.onAddToProjectWithStatus(
                    project.id,
                    statusField.id,
                    e.target.value
                  )}
                  defaultValue=""
                >
                  <option value="" disabled>Select status...</option>
                  {statusField.options.map(opt => (
                    <option key={opt.id} value={opt.id}>{opt.name}</option>
                  ))}
                </select>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  /**
   * Render all editable project fields (Status, Priority, Size, Focus, Iteration, etc.)
   */
  private renderProjectFields() {
    const { projects } = this.props
    const { currentIssue, issueDetails } = this.state

    // Find the current project
    const currentProject = currentIssue.projectTitle
      ? projects.find(p => p.title === currentIssue.projectTitle)
      : issueDetails?.projectInfo
        ? projects.find(p => p.id === issueDetails.projectInfo?.projectId)
        : null

    if (!currentProject) {
      return null
    }

    // Get field values from issueDetails
    const fieldValues = issueDetails?.projectInfo?.fieldValues ?? []

    // Filter to editable fields (exclude Title, text fields like Description, etc.)
    const editableFieldTypes = ['SINGLE_SELECT', 'NUMBER', 'DATE', 'ITERATION']
    const editableFields = currentProject.fields.filter(
      f => editableFieldTypes.includes(f.dataType)
    )

    return (
      <div className="project-fields-list">
        {editableFields.map(field => this.renderProjectField(currentProject, field, fieldValues))}
      </div>
    )
  }

  private renderProjectField(
    project: IAPIProjectV2,
    field: { id: string; name: string; dataType: string; options?: ReadonlyArray<{ id: string; name: string; color?: string }>; configuration?: { iterations: ReadonlyArray<{ id: string; title: string; startDate: string; duration: number }>; completedIterations: ReadonlyArray<{ id: string; title: string; startDate: string; duration: number }> } },
    fieldValues: ReadonlyArray<IAPIProjectFieldValue>
  ) {
    // Find current value for this field
    const currentValue = fieldValues.find(fv => fv.field.name === field.name)

    switch (field.dataType) {
      case 'SINGLE_SELECT':
        return this.renderSingleSelectField(project, field, currentValue)
      case 'NUMBER':
        return this.renderNumberField(project, field, currentValue)
      case 'DATE':
        return this.renderDateField(project, field, currentValue)
      case 'ITERATION':
        return this.renderIterationField(project, field, currentValue)
      default:
        return null
    }
  }

  private renderSingleSelectField(
    project: IAPIProjectV2,
    field: { id: string; name: string; dataType: string; options?: ReadonlyArray<{ id: string; name: string; color?: string }> },
    currentValue: IAPIProjectFieldValue | undefined
  ) {
    const selectedOptionId = currentValue?.type === 'singleSelect' ? currentValue.optionId : ''
    const options = field.options ?? []

    return (
      <div key={field.id} className="project-field-row">
        <label className="project-field-label">{field.name}</label>
        <select
          className="project-field-select"
          value={selectedOptionId}
          onChange={e => {
            if (e.target.value) {
              this.onUpdateProjectField(project.id, field.id, 'SINGLE_SELECT', e.target.value)
            }
          }}
        >
          <option value="">Select {field.name.toLowerCase()}...</option>
          {options.map(option => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
      </div>
    )
  }

  private renderNumberField(
    project: IAPIProjectV2,
    field: { id: string; name: string; dataType: string },
    currentValue: IAPIProjectFieldValue | undefined
  ) {
    const numberValue = currentValue?.type === 'number' ? currentValue.number : ''

    return (
      <div key={field.id} className="project-field-row">
        <label className="project-field-label">{field.name}</label>
        <input
          type="number"
          className="project-field-input"
          placeholder={`Enter ${field.name.toLowerCase()}...`}
          defaultValue={numberValue}
          onBlur={e => {
            const val = e.target.value.trim()
            if (val !== '' && !isNaN(parseFloat(val))) {
              this.onUpdateProjectField(project.id, field.id, 'NUMBER', parseFloat(val))
            }
          }}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              const target = e.target as HTMLInputElement
              const val = target.value.trim()
              if (val !== '' && !isNaN(parseFloat(val))) {
                this.onUpdateProjectField(project.id, field.id, 'NUMBER', parseFloat(val))
              }
              target.blur()
            }
          }}
        />
      </div>
    )
  }

  private renderDateField(
    project: IAPIProjectV2,
    field: { id: string; name: string; dataType: string },
    currentValue: IAPIProjectFieldValue | undefined
  ) {
    const dateValue = currentValue?.type === 'date' ? currentValue.date : ''

    return (
      <div key={field.id} className="project-field-row">
        <label className="project-field-label">{field.name}</label>
        <input
          type="date"
          className="project-field-input"
          value={dateValue}
          onChange={e => {
            if (e.target.value) {
              this.onUpdateProjectField(project.id, field.id, 'DATE', e.target.value)
            }
          }}
        />
      </div>
    )
  }

  private renderIterationField(
    project: IAPIProjectV2,
    field: { id: string; name: string; dataType: string; configuration?: { iterations: ReadonlyArray<{ id: string; title: string; startDate: string; duration: number }>; completedIterations: ReadonlyArray<{ id: string; title: string; startDate: string; duration: number }> } },
    currentValue: IAPIProjectFieldValue | undefined
  ) {
    const selectedIterationId = currentValue?.type === 'iteration' ? currentValue.iterationId : ''
    const iterations = field.configuration?.iterations ?? []
    const completedIterations = field.configuration?.completedIterations ?? []

    // Mark the current iteration
    const today = new Date()
    const currentIteration = iterations.find(iter => {
      const start = new Date(iter.startDate)
      const end = new Date(start)
      end.setDate(end.getDate() + iter.duration)
      return today >= start && today <= end
    })

    return (
      <div key={field.id} className="project-field-row">
        <label className="project-field-label">{field.name}</label>
        <select
          className="project-field-select"
          value={selectedIterationId}
          onChange={e => {
            if (e.target.value) {
              this.onUpdateProjectField(project.id, field.id, 'ITERATION', e.target.value)
            }
          }}
        >
          <option value="">Select {field.name.toLowerCase()}...</option>
          {iterations.length > 0 && (
            <optgroup label="Active Iterations">
              {iterations.map(iter => (
                <option key={iter.id} value={iter.id}>
                  {iter.title}{currentIteration?.id === iter.id ? ' (Current)' : ''}
                </option>
              ))}
            </optgroup>
          )}
          {completedIterations.length > 0 && (
            <optgroup label="Completed Iterations">
              {completedIterations.map(iter => (
                <option key={iter.id} value={iter.id}>
                  {iter.title}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </div>
    )
  }

  /**
   * Render a single timeline event
   */
  private renderTimelineEvent(
    event: IAPIIssueTimelineEvent,
    index: number
  ): JSX.Element | null {
    const eventType = event.event

    // Comments are rendered as full comment boxes
    if (eventType === 'commented') {
      return this.renderCommentEvent(event, index)
    }

    // Other events are rendered as timeline items
    return this.renderActivityEvent(event, index)
  }

  private renderCommentEvent(
    event: IAPIIssueTimelineEvent,
    index: number
  ): JSX.Element | null {
    const user = event.user || event.actor
    if (!user || !event.body) return null

    return (
      <div key={`comment-${index}`} className="comment-container">
        <img
          src={user.avatar_url}
          alt={user.login}
          className="comment-avatar"
        />
        <div className="comment-content">
          <div className="comment-header">
            <span className="comment-author">{user.login}</span>
            <span className="comment-date">
              commented {this.formatDate(event.created_at)}
            </span>
          </div>
          <div className="comment-body markdown-body">
            {this.renderMarkdown(event.body)}
          </div>
        </div>
      </div>
    )
  }

  private renderActivityEvent(
    event: IAPIIssueTimelineEvent,
    index: number
  ): JSX.Element | null {
    const actor = event.actor
    const eventContent = this.getEventContent(event)

    if (!eventContent) return null

    return (
      <div key={`event-${index}`} className="timeline-event">
        <div className="timeline-event-icon">
          {this.getEventIcon(event.event)}
        </div>
        <div className="timeline-event-content">
          {actor && (
            <img
              src={actor.avatar_url}
              alt={actor.login}
              className="timeline-actor-avatar"
            />
          )}
          <span className="timeline-event-text">
            {actor && <strong>{actor.login}</strong>}
            {' '}{eventContent}
            <span className="timeline-event-date">
              {this.formatDate(event.created_at)}
            </span>
          </span>
        </div>
      </div>
    )
  }

  private getEventIcon(eventType: string): JSX.Element {
    switch (eventType) {
      case 'labeled':
      case 'unlabeled':
        return <Octicon symbol={octicons.tag} />
      case 'assigned':
      case 'unassigned':
        return <Octicon symbol={octicons.person} />
      case 'milestoned':
      case 'demilestoned':
        return <Octicon symbol={octicons.milestone} />
      case 'renamed':
        return <Octicon symbol={octicons.pencil} />
      case 'closed':
        return <Octicon symbol={octicons.issueClosed} className="closed" />
      case 'reopened':
        return <Octicon symbol={octicons.issueReopened} className="reopened" />
      case 'cross-referenced':
      case 'referenced':
        return <Octicon symbol={octicons.crossReference} />
      case 'added_to_project':
      case 'added_to_project_v2':
      case 'moved_columns_in_project':
      case 'project_v2_item_status_changed':
        return <Octicon symbol={octicons.project} />
      case 'issue_type_added':
        return <Octicon symbol={octicons.issueOpened} />
      case 'review_requested':
        return <Octicon symbol={octicons.eye} />
      case 'connected':
      case 'disconnected':
        return <Octicon symbol={octicons.link} />
      case 'subscribed':
        return <Octicon symbol={octicons.eye} />
      case 'mentioned':
        return <Octicon symbol={octicons.mention} />
      default:
        return <Octicon symbol={octicons.dot} />
    }
  }

  private getEventContent(event: IAPIIssueTimelineEvent): React.ReactNode {
    switch (event.event) {
      case 'labeled':
        if (event.label) {
          return (
            <>
              added the{' '}
              <span
                className="timeline-label"
                style={{ backgroundColor: `#${event.label.color}` }}
              >
                {event.label.name}
              </span>{' '}
              label
            </>
          )
        }
        return 'added a label'

      case 'unlabeled':
        if (event.label) {
          return (
            <>
              removed the{' '}
              <span
                className="timeline-label"
                style={{ backgroundColor: `#${event.label.color}` }}
              >
                {event.label.name}
              </span>{' '}
              label
            </>
          )
        }
        return 'removed a label'

      case 'assigned':
        if (event.assignee) {
          return (
            <>
              assigned <strong>{event.assignee.login}</strong>
            </>
          )
        }
        return 'assigned someone'

      case 'unassigned':
        if (event.assignee) {
          return (
            <>
              unassigned <strong>{event.assignee.login}</strong>
            </>
          )
        }
        return 'unassigned someone'

      case 'milestoned':
        if (event.milestone) {
          return (
            <>
              added this to the <strong>{event.milestone.title}</strong> milestone
            </>
          )
        }
        return 'added a milestone'

      case 'demilestoned':
        if (event.milestone) {
          return (
            <>
              removed this from the <strong>{event.milestone.title}</strong> milestone
            </>
          )
        }
        return 'removed from milestone'

      case 'renamed':
        if (event.rename) {
          return (
            <>
              changed the title from <s>{event.rename.from}</s> to{' '}
              <strong>{event.rename.to}</strong>
            </>
          )
        }
        return 'renamed this issue'

      case 'closed':
        return (
          <>
            closed this{event.state_reason ? ` as ${event.state_reason}` : ''}
          </>
        )

      case 'reopened':
        return 'reopened this'

      case 'cross-referenced':
      case 'referenced':
        if (event.source?.issue) {
          const repo = event.source.issue.repository?.full_name
          return (
            <>
              mentioned this issue in{' '}
              <strong>
                {repo ? `${repo}#` : '#'}
                {event.source.issue.number}
              </strong>
            </>
          )
        }
        return 'referenced this'

      case 'added_to_project':
        if (event.project_card) {
          return (
            <>
              added this to{' '}
              <strong>{event.project_card.column_name}</strong> in a project
            </>
          )
        }
        return 'added to a project'

      case 'added_to_project_v2':
        return 'added this to a project'

      case 'moved_columns_in_project':
        if (event.project_card) {
          if (event.project_card.previous_column_name) {
            return (
              <>
                moved this from <strong>{event.project_card.previous_column_name}</strong>{' '}
                to <strong>{event.project_card.column_name}</strong> in a project
              </>
            )
          }
          return (
            <>
              moved this to <strong>{event.project_card.column_name}</strong> in a project
            </>
          )
        }
        return 'moved in project'

      case 'project_v2_item_status_changed':
        return 'changed the status in a project'

      case 'issue_type_added':
        return 'set the issue type'

      case 'review_requested':
        if (event.requested_reviewer) {
          return (
            <>
              requested a review from <strong>{event.requested_reviewer.login}</strong>
            </>
          )
        }
        return 'requested a review'

      case 'connected':
        return 'linked an issue'

      case 'disconnected':
        return 'unlinked an issue'

      case 'subscribed':
        return 'subscribed to this issue'

      case 'mentioned':
        return 'was mentioned'

      default:
        console.log('[Timeline] Unknown event type:', event.event, event)
        return `${event.event.replace(/_/g, ' ')}`
    }
  }

  // === Event handlers ===

  private onCommentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    this.setState({ newComment: e.target.value })
  }

  private onSubmitComment = async () => {
    const { newComment } = this.state
    if (!newComment.trim()) return

    this.setState({ isSubmittingComment: true })

    try {
      const { owner, repo, issue } = this.props
      const comment = await this.api.createIssueComment(
        owner,
        repo,
        issue.issueNumber,
        newComment
      )

      if (comment && this.state.issueDetails) {
        const newCommentObj = {
          id: comment.id,
          body: comment.body,
          user: comment.user,
          createdAt: comment.created_at,
        }
        this.setState({
          issueDetails: {
            ...this.state.issueDetails,
            comments: [...this.state.issueDetails.comments, newCommentObj],
          },
          newComment: '',
          isSubmittingComment: false,
        })
        // Reload to get the updated timeline
        this.loadIssueDetails()
      }
    } catch (e) {
      console.warn('Failed to add comment', e)
      this.setState({ isSubmittingComment: false })
    }
  }

  private onToggleState = async () => {
    const { currentIssue } = this.state
    const newState = currentIssue.state === 'OPEN' ? 'closed' : 'open'

    try {
      const { owner, repo, issue } = this.props
      await this.api.updateIssue(owner, repo, issue.issueNumber, { state: newState })

      // Update local state immediately
      this.setState({
        currentIssue: {
          ...currentIssue,
          state: newState === 'open' ? 'OPEN' : 'CLOSED',
        },
      })

      // Reload to get the updated timeline
      this.loadIssueDetails()

      // Notify parent if callback provided
      this.props.onIssueUpdated?.()
    } catch (e) {
      console.warn('Failed to update issue state', e)
    }
  }

  private toggleAssigneeDropdown = () => {
    this.setState(prev => ({
      showAssigneeDropdown: !prev.showAssigneeDropdown,
      showLabelDropdown: false,
      showMilestoneDropdown: false,
      showProjectStatusDropdown: false,
    }))
  }

  private toggleLabelDropdown = () => {
    this.setState(prev => ({
      showLabelDropdown: !prev.showLabelDropdown,
      showAssigneeDropdown: false,
      showMilestoneDropdown: false,
      showProjectStatusDropdown: false,
    }))
  }

  private toggleMilestoneDropdown = () => {
    this.setState(prev => ({
      showMilestoneDropdown: !prev.showMilestoneDropdown,
      showAssigneeDropdown: false,
      showLabelDropdown: false,
      showProjectStatusDropdown: false,
    }))
  }

  private toggleProjectStatusDropdown = () => {
    this.setState(prev => ({
      showProjectStatusDropdown: !prev.showProjectStatusDropdown,
      showAssigneeDropdown: false,
      showLabelDropdown: false,
      showMilestoneDropdown: false,
    }))
  }

  private onToggleAssignee = async (login: string) => {
    const { issueDetails } = this.state
    if (!issueDetails) return

    const currentLogins = issueDetails.assignees.map(a => a.login)
    const isAssigned = currentLogins.includes(login)

    const newAssignees = isAssigned
      ? currentLogins.filter(l => l !== login)
      : [...currentLogins, login]

    try {
      const { owner, repo, issue } = this.props
      const updatedIssue = await this.api.updateIssue(
        owner,
        repo,
        issue.issueNumber,
        { assignees: [...newAssignees] }
      )

      this.setState({
        issueDetails: {
          ...issueDetails,
          assignees: updatedIssue.assignees || [],
        },
      })
    } catch (e) {
      console.warn('Failed to update assignees', e)
    }
  }

  private onToggleLabel = async (labelName: string) => {
    const { currentIssue } = this.state
    const currentLabels = currentIssue.labels.map(l => l.name)
    const hasLabel = currentLabels.includes(labelName)

    const newLabels = hasLabel
      ? currentLabels.filter(l => l !== labelName)
      : [...currentLabels, labelName]

    try {
      const { owner, repo, issue } = this.props
      await this.api.updateIssue(owner, repo, issue.issueNumber, { labels: [...newLabels] })

      // Reload to get updated labels
      this.loadIssueDetails()
      this.props.onIssueUpdated?.()
    } catch (e) {
      console.warn('Failed to update labels', e)
    }
  }

  private onUpdateMilestone = async (milestoneNumber: number | null) => {
    try {
      const { owner, repo, issue } = this.props
      const updatedIssue = await this.api.updateIssue(
        owner,
        repo,
        issue.issueNumber,
        { milestone: milestoneNumber }
      )

      if (this.state.issueDetails) {
        this.setState({
          issueDetails: {
            ...this.state.issueDetails,
            milestone: updatedIssue.milestone || null,
          },
        })
      }
    } catch (e) {
      console.warn('Failed to update milestone', e)
    }
  }

  private onSelectProjectStatusFromField = (
    projectId: string,
    fieldId: string,
    optionId: string
  ) => {
    this.onUpdateProjectField(projectId, fieldId, 'SINGLE_SELECT', optionId)
    this.setState({ showProjectStatusDropdown: false })
  }

  private onUpdateProjectField = async (
    projectId: string,
    fieldId: string,
    fieldType: string,
    value: string | number
  ) => {
    const { issueDetails } = this.state
    const projectInfo = issueDetails?.projectInfo

    if (!projectInfo?.itemId) {
      console.error('Cannot update field: missing project item ID')
      return
    }

    try {
      await this.api.updateProjectItemField(
        projectId,
        projectInfo.itemId,
        fieldId,
        fieldType,
        value
      )

      // Reload to get updated field values
      this.loadIssueDetails()
      this.props.onIssueUpdated?.()
    } catch (e) {
      console.warn('Failed to update project field', e)
    }
  }

  private onAddToProjectWithStatus = async (
    projectId: string,
    statusFieldId: string,
    statusOptionId: string
  ) => {
    if (!statusOptionId) return

    try {
      const { issue } = this.props

      // First, add the issue to the project
      const itemId = await this.api.addIssueToProject(projectId, issue.issueId)

      if (!itemId) {
        console.warn('Failed to add issue to project - no item ID returned')
        return
      }

      // Then set the status on the new project item
      await this.api.updateProjectItemField(
        projectId,
        itemId,
        statusFieldId,
        'SINGLE_SELECT',
        statusOptionId
      )

      this.setState({ showProjectStatusDropdown: false })

      // Reload to show updated project info
      this.loadIssueDetails()
      this.props.onIssueUpdated?.()
    } catch (e) {
      console.warn('Failed to add issue to project', e)
    }
  }

  // === Utility methods ===

  private getStatusColor(color: string): string {
    const colorMap: Record<string, string> = {
      GRAY: '#8b949e',
      RED: '#f85149',
      ORANGE: '#db6d28',
      YELLOW: '#d29922',
      GREEN: '#3fb950',
      BLUE: '#58a6ff',
      PURPLE: '#a371f7',
      PINK: '#db61a2',
    }
    return colorMap[color.toUpperCase()] || '#8b949e'
  }

  private formatDate(isoString: string): string {
    const date = new Date(isoString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffDays === 0) {
      return 'today'
    } else if (diffDays === 1) {
      return 'yesterday'
    } else if (diffDays < 7) {
      return `${diffDays} days ago`
    } else if (diffDays < 30) {
      const weeks = Math.floor(diffDays / 7)
      return `${weeks} week${weeks > 1 ? 's' : ''} ago`
    } else if (diffDays < 365) {
      const months = Math.floor(diffDays / 30)
      return `${months} month${months > 1 ? 's' : ''} ago`
    } else {
      return date.toLocaleDateString()
    }
  }

  private renderMarkdown(text: string): React.ReactNode {
    const paragraphs = text.split(/\n\n+/)

    return paragraphs.map((paragraph, index) => {
      if (paragraph.startsWith('```')) {
        const lines = paragraph.split('\n')
        const lang = lines[0].slice(3)
        const code = lines.slice(1, -1).join('\n')
        return (
          <pre key={index} className={`language-${lang}`}>
            <code>{code}</code>
          </pre>
        )
      }

      if (paragraph.startsWith('# ')) {
        return <h1 key={index}>{paragraph.slice(2)}</h1>
      }
      if (paragraph.startsWith('## ')) {
        return <h2 key={index}>{paragraph.slice(3)}</h2>
      }
      if (paragraph.startsWith('### ')) {
        return <h3 key={index}>{paragraph.slice(4)}</h3>
      }

      if (paragraph.match(/^[-*]\s/m)) {
        const items = paragraph.split(/\n/).filter(line => line.match(/^[-*]\s/))
        return (
          <ul key={index}>
            {items.map((item, i) => (
              <li key={i}>{item.replace(/^[-*]\s/, '')}</li>
            ))}
          </ul>
        )
      }

      const formatted = this.formatInline(paragraph)
      return <p key={index}>{formatted}</p>
    })
  }

  private formatInline(text: string): React.ReactNode {
    const parts: React.ReactNode[] = []
    let lastIndex = 0
    const codeRegex = /`([^`]+)`/g
    let match

    while ((match = codeRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(text.slice(lastIndex, match.index))
      }
      parts.push(<code key={match.index}>{match[1]}</code>)
      lastIndex = match.index + match[0].length
    }

    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex))
    }

    return parts.length > 0 ? parts : text
  }
}
