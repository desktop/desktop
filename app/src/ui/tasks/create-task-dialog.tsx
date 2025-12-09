import * as React from 'react'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { TextBox } from '../lib/text-box'
import { TextArea } from '../lib/text-area'
import { Row } from '../lib/row'
import {
  IAPIIdentity,
  IAPILabel,
  IAPIMilestone,
  IAPIProjectV2,
} from '../../lib/api'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import classNames from 'classnames'

interface ICreateTaskDialogProps {
  /** Repository owner */
  readonly owner: string

  /** Repository name */
  readonly repoName: string

  /** Available collaborators for assignment */
  readonly collaborators: ReadonlyArray<IAPIIdentity>

  /** Available labels */
  readonly labels: ReadonlyArray<IAPILabel>

  /** Available milestones */
  readonly milestones: ReadonlyArray<IAPIMilestone>

  /** Available GitHub Projects V2 */
  readonly projects: ReadonlyArray<IAPIProjectV2>

  /** Called when the dialog is dismissed */
  readonly onDismissed: () => void

  /** Called when the dialog loads to fetch metadata */
  readonly onLoad: () => void

  /** Called when a task is created */
  readonly onCreateTask: (
    title: string,
    body: string,
    assignees: ReadonlyArray<string>,
    labels: ReadonlyArray<string>,
    milestone: number | undefined,
    projectId: string | undefined,
    statusOptionId: string | undefined,
    iterationId: string | undefined
  ) => Promise<void>

  /** Initial project ID to pre-select */
  readonly initialProjectId?: string

  /** Initial status option ID to pre-select */
  readonly initialStatusOptionId?: string

  /** Initial iteration ID to pre-select */
  readonly initialIterationId?: string
}

interface ICreateTaskDialogState {
  readonly title: string
  readonly body: string
  readonly selectedAssignees: Set<string>
  readonly selectedLabels: Set<string>
  readonly selectedMilestone: number | undefined
  readonly selectedProjectId: string | undefined
  readonly selectedStatusOptionId: string | undefined
  readonly selectedIterationId: string | undefined
  readonly isCreating: boolean
  readonly showAssigneeDropdown: boolean
  readonly showLabelDropdown: boolean
  readonly showMilestoneDropdown: boolean
  readonly showProjectDropdown: boolean
  readonly showStatusDropdown: boolean
  readonly showIterationDropdown: boolean
}

export class CreateTaskDialog extends React.Component<
  ICreateTaskDialogProps,
  ICreateTaskDialogState
> {
  public constructor(props: ICreateTaskDialogProps) {
    super(props)
    this.state = {
      title: '',
      body: '',
      selectedAssignees: new Set(),
      selectedLabels: new Set(),
      selectedMilestone: undefined,
      selectedProjectId: props.initialProjectId,
      selectedStatusOptionId: props.initialStatusOptionId,
      selectedIterationId: props.initialIterationId,
      isCreating: false,
      showAssigneeDropdown: false,
      showLabelDropdown: false,
      showMilestoneDropdown: false,
      showProjectDropdown: false,
      showStatusDropdown: false,
      showIterationDropdown: false,
    }
  }

  public componentDidMount() {
    // Fetch collaborators, labels, and milestones when dialog opens
    this.props.onLoad()
  }

  private onTitleChange = (value: string) => {
    this.setState({ title: value })
  }

  private onBodyChange = (event: React.FormEvent<HTMLTextAreaElement>) => {
    this.setState({ body: event.currentTarget.value })
  }

  private toggleAssignee = (login: string) => {
    const newAssignees = new Set(this.state.selectedAssignees)
    if (newAssignees.has(login)) {
      newAssignees.delete(login)
    } else {
      newAssignees.add(login)
    }
    this.setState({ selectedAssignees: newAssignees })
  }

  private toggleLabel = (name: string) => {
    const newLabels = new Set(this.state.selectedLabels)
    if (newLabels.has(name)) {
      newLabels.delete(name)
    } else {
      newLabels.add(name)
    }
    this.setState({ selectedLabels: newLabels })
  }

  private selectMilestone = (number: number | undefined) => {
    this.setState({
      selectedMilestone: number,
      showMilestoneDropdown: false,
    })
  }

  private selectProject = (projectId: string | undefined) => {
    this.setState({
      selectedProjectId: projectId,
      selectedStatusOptionId: undefined, // Reset status when project changes
      showProjectDropdown: false,
    })
  }

  private selectStatus = (statusOptionId: string | undefined) => {
    this.setState({
      selectedStatusOptionId: statusOptionId,
      showStatusDropdown: false,
    })
  }

  private onSubmit = async () => {
    const {
      title,
      body,
      selectedAssignees,
      selectedLabels,
      selectedMilestone,
      selectedProjectId,
      selectedStatusOptionId,
      selectedIterationId,
    } = this.state

    if (title.trim().length === 0) {
      return
    }

    this.setState({ isCreating: true })

    try {
      await this.props.onCreateTask(
        title.trim(),
        body.trim(),
        Array.from(selectedAssignees),
        Array.from(selectedLabels),
        selectedMilestone,
        selectedProjectId,
        selectedStatusOptionId,
        selectedIterationId
      )
      this.props.onDismissed()
    } catch (error) {
      this.setState({ isCreating: false })
      // Error handling could be improved with a proper error state
      console.error('Failed to create task:', error)
    }
  }

  private toggleAssigneeDropdown = () => {
    this.setState({
      showAssigneeDropdown: !this.state.showAssigneeDropdown,
      showLabelDropdown: false,
      showMilestoneDropdown: false,
      showProjectDropdown: false,
      showStatusDropdown: false,
    })
  }

  private toggleLabelDropdown = () => {
    this.setState({
      showLabelDropdown: !this.state.showLabelDropdown,
      showAssigneeDropdown: false,
      showMilestoneDropdown: false,
      showProjectDropdown: false,
      showStatusDropdown: false,
    })
  }

  private toggleMilestoneDropdown = () => {
    this.setState({
      showMilestoneDropdown: !this.state.showMilestoneDropdown,
      showAssigneeDropdown: false,
      showLabelDropdown: false,
      showProjectDropdown: false,
      showStatusDropdown: false,
    })
  }

  private toggleProjectDropdown = () => {
    this.setState({
      showProjectDropdown: !this.state.showProjectDropdown,
      showAssigneeDropdown: false,
      showLabelDropdown: false,
      showMilestoneDropdown: false,
      showStatusDropdown: false,
    })
  }

  private toggleStatusDropdown = () => {
    this.setState({
      showStatusDropdown: !this.state.showStatusDropdown,
      showAssigneeDropdown: false,
      showLabelDropdown: false,
      showMilestoneDropdown: false,
      showProjectDropdown: false,
      showIterationDropdown: false,
    })
  }

  private toggleIterationDropdown = () => {
    this.setState({
      showIterationDropdown: !this.state.showIterationDropdown,
      showAssigneeDropdown: false,
      showLabelDropdown: false,
      showMilestoneDropdown: false,
      showProjectDropdown: false,
      showStatusDropdown: false,
    })
  }

  private selectIteration = (iterationId: string | undefined) => {
    this.setState({
      selectedIterationId: iterationId,
      showIterationDropdown: false,
    })
  }

  private renderAssigneeSelector() {
    const { collaborators } = this.props
    const { selectedAssignees, showAssigneeDropdown } = this.state

    return (
      <div className="task-metadata-selector">
        <button
          type="button"
          className="selector-button"
          onClick={this.toggleAssigneeDropdown}
        >
          <Octicon symbol={octicons.person} />
          <span>
            {selectedAssignees.size === 0
              ? 'Assignees'
              : `${selectedAssignees.size} assigned`}
          </span>
          <Octicon symbol={octicons.triangleDown} />
        </button>
        {showAssigneeDropdown && (
          <div className="selector-dropdown">
            {collaborators.length === 0 ? (
              <div className="dropdown-empty">No collaborators found</div>
            ) : (
              collaborators.map(collab => (
                <button
                  key={collab.id}
                  type="button"
                  className={classNames('dropdown-item', {
                    selected: selectedAssignees.has(collab.login),
                  })}
                  onClick={() => this.toggleAssignee(collab.login)}
                >
                  <img
                    src={collab.avatar_url}
                    alt={collab.login}
                    className="avatar"
                  />
                  <span>{collab.login}</span>
                  {selectedAssignees.has(collab.login) && (
                    <Octicon symbol={octicons.check} />
                  )}
                </button>
              ))
            )}
          </div>
        )}
      </div>
    )
  }

  private renderLabelSelector() {
    const { labels } = this.props
    const { selectedLabels, showLabelDropdown } = this.state

    return (
      <div className="task-metadata-selector">
        <button
          type="button"
          className="selector-button"
          onClick={this.toggleLabelDropdown}
        >
          <Octicon symbol={octicons.tag} />
          <span>
            {selectedLabels.size === 0
              ? 'Labels'
              : `${selectedLabels.size} labels`}
          </span>
          <Octicon symbol={octicons.triangleDown} />
        </button>
        {showLabelDropdown && (
          <div className="selector-dropdown">
            {labels.length === 0 ? (
              <div className="dropdown-empty">No labels found</div>
            ) : (
              labels.map(label => (
                <button
                  key={label.name}
                  type="button"
                  className={classNames('dropdown-item', {
                    selected: selectedLabels.has(label.name),
                  })}
                  onClick={() => this.toggleLabel(label.name)}
                >
                  <span
                    className="label-color"
                    style={{ backgroundColor: `#${label.color}` }}
                  />
                  <span>{label.name}</span>
                  {selectedLabels.has(label.name) && (
                    <Octicon symbol={octicons.check} />
                  )}
                </button>
              ))
            )}
          </div>
        )}
      </div>
    )
  }

  private renderMilestoneSelector() {
    const { milestones } = this.props
    const { selectedMilestone, showMilestoneDropdown } = this.state

    const currentMilestone = milestones.find(
      m => m.number === selectedMilestone
    )

    return (
      <div className="task-metadata-selector">
        <button
          type="button"
          className="selector-button"
          onClick={this.toggleMilestoneDropdown}
        >
          <Octicon symbol={octicons.milestone} />
          <span>{currentMilestone?.title ?? 'Milestone'}</span>
          <Octicon symbol={octicons.triangleDown} />
        </button>
        {showMilestoneDropdown && (
          <div className="selector-dropdown">
            <button
              type="button"
              className={classNames('dropdown-item', {
                selected: selectedMilestone === undefined,
              })}
              onClick={() => this.selectMilestone(undefined)}
            >
              <span>No milestone</span>
            </button>
            {milestones.map(milestone => (
              <button
                key={milestone.number}
                type="button"
                className={classNames('dropdown-item', {
                  selected: selectedMilestone === milestone.number,
                })}
                onClick={() => this.selectMilestone(milestone.number)}
              >
                <span>{milestone.title}</span>
                {selectedMilestone === milestone.number && (
                  <Octicon symbol={octicons.check} />
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  private renderProjectSelector() {
    const { projects } = this.props
    const { selectedProjectId, showProjectDropdown } = this.state

    const currentProject = projects.find(p => p.id === selectedProjectId)

    return (
      <div className="task-metadata-selector">
        <button
          type="button"
          className="selector-button"
          onClick={this.toggleProjectDropdown}
        >
          <Octicon symbol={octicons.project} />
          <span>{currentProject?.title ?? 'Project'}</span>
          <Octicon symbol={octicons.triangleDown} />
        </button>
        {showProjectDropdown && (
          <div className="selector-dropdown">
            <button
              type="button"
              className={classNames('dropdown-item', {
                selected: selectedProjectId === undefined,
              })}
              onClick={() => this.selectProject(undefined)}
            >
              <span>No project</span>
            </button>
            {projects.map(project => (
              <button
                key={project.id}
                type="button"
                className={classNames('dropdown-item', {
                  selected: selectedProjectId === project.id,
                })}
                onClick={() => this.selectProject(project.id)}
              >
                <span>{project.title}</span>
                {selectedProjectId === project.id && (
                  <Octicon symbol={octicons.check} />
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  private renderStatusSelector() {
    const { projects } = this.props
    const { selectedProjectId, selectedStatusOptionId, showStatusDropdown } =
      this.state

    // Only show status selector if a project is selected
    if (!selectedProjectId) {
      return null
    }

    const currentProject = projects.find(p => p.id === selectedProjectId)
    if (!currentProject) {
      return null
    }

    // Find the Status field in the project
    const statusField = currentProject.fields.find(
      f => f.name === 'Status' && f.dataType === 'SINGLE_SELECT'
    )
    if (!statusField || !statusField.options) {
      return null
    }

    const currentStatus = statusField.options.find(
      o => o.id === selectedStatusOptionId
    )

    return (
      <div className="task-metadata-selector">
        <button
          type="button"
          className="selector-button"
          onClick={this.toggleStatusDropdown}
        >
          <Octicon symbol={octicons.issueOpened} />
          <span>{currentStatus?.name ?? 'Status'}</span>
          <Octicon symbol={octicons.triangleDown} />
        </button>
        {showStatusDropdown && (
          <div className="selector-dropdown">
            <button
              type="button"
              className={classNames('dropdown-item', {
                selected: selectedStatusOptionId === undefined,
              })}
              onClick={() => this.selectStatus(undefined)}
            >
              <span>No status</span>
            </button>
            {statusField.options.map(option => (
              <button
                key={option.id}
                type="button"
                className={classNames('dropdown-item', {
                  selected: selectedStatusOptionId === option.id,
                })}
                onClick={() => this.selectStatus(option.id)}
              >
                {option.color && (
                  <span
                    className="status-color"
                    style={{
                      backgroundColor: this.getStatusColor(option.color),
                    }}
                  />
                )}
                <span>{option.name}</span>
                {selectedStatusOptionId === option.id && (
                  <Octicon symbol={octicons.check} />
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  private getStatusColor(color: string): string {
    // GitHub Projects V2 uses color names, map them to CSS colors
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

  private renderIterationSelector() {
    const { projects } = this.props
    const { selectedProjectId, selectedIterationId, showIterationDropdown } = this.state

    // Find the selected project
    const project = projects.find(p => p.id === selectedProjectId)
    if (!project) {
      return null
    }

    // Find the iteration field
    const iterationField = project.fields.find(f => f.dataType === 'ITERATION')
    if (!iterationField?.configuration?.iterations) {
      return null
    }

    // Combine active and completed iterations
    const allIterations = [
      ...(iterationField.configuration.iterations || []),
      ...(iterationField.configuration.completedIterations || []),
    ]

    if (allIterations.length === 0) {
      return null
    }

    const currentIteration = allIterations.find(i => i.id === selectedIterationId)

    return (
      <div className="task-metadata-selector">
        <button
          type="button"
          className="selector-button"
          onClick={this.toggleIterationDropdown}
        >
          <Octicon symbol={octicons.iterations} />
          <span>{currentIteration?.title ?? 'Iteration'}</span>
          <Octicon symbol={octicons.triangleDown} />
        </button>
        {showIterationDropdown && (
          <div className="selector-dropdown">
            <button
              type="button"
              className={classNames('dropdown-item', {
                selected: selectedIterationId === undefined,
              })}
              onClick={() => this.selectIteration(undefined)}
            >
              <span>No iteration</span>
            </button>
            {allIterations.map(iteration => (
              <button
                key={iteration.id}
                type="button"
                className={classNames('dropdown-item', {
                  selected: selectedIterationId === iteration.id,
                })}
                onClick={() => this.selectIteration(iteration.id)}
              >
                <span>{iteration.title}</span>
                {selectedIterationId === iteration.id && (
                  <Octicon symbol={octicons.check} />
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  private renderSelectedItems() {
    const { selectedAssignees, selectedLabels } = this.state
    const { collaborators, labels } = this.props

    const selectedAssigneeList = collaborators.filter(c =>
      selectedAssignees.has(c.login)
    )
    const selectedLabelList = labels.filter(l => selectedLabels.has(l.name))

    if (selectedAssigneeList.length === 0 && selectedLabelList.length === 0) {
      return null
    }

    return (
      <Row className="selected-items-row">
        {selectedAssigneeList.map(assignee => (
          <span key={assignee.login} className="selected-assignee">
            <img
              src={assignee.avatar_url}
              alt={assignee.login}
              className="avatar-small"
            />
            {assignee.login}
            <button
              type="button"
              className="remove-button"
              onClick={() => this.toggleAssignee(assignee.login)}
            >
              <Octicon symbol={octicons.x} />
            </button>
          </span>
        ))}
        {selectedLabelList.map(label => (
          <span
            key={label.name}
            className="selected-label"
            style={{ backgroundColor: `#${label.color}` }}
          >
            {label.name}
            <button
              type="button"
              className="remove-button"
              onClick={() => this.toggleLabel(label.name)}
            >
              <Octicon symbol={octicons.x} />
            </button>
          </span>
        ))}
      </Row>
    )
  }

  public render() {
    const { title, isCreating } = this.state
    const disabled = title.trim().length === 0

    return (
      <Dialog
        id="create-task"
        title="Create Task"
        onSubmit={this.onSubmit}
        onDismissed={this.props.onDismissed}
        loading={isCreating}
        disabled={isCreating}
      >
        <DialogContent>
          <Row>
            <TextBox
              label="Title"
              value={title}
              onValueChanged={this.onTitleChange}
              placeholder="Task title"
              autoFocus={true}
            />
          </Row>

          <Row>
            <TextArea
              label="Description"
              value={this.state.body}
              onChange={this.onBodyChange}
              placeholder="Add a description..."
              rows={4}
            />
          </Row>

          <Row className="metadata-selectors">
            {this.renderAssigneeSelector()}
            {this.renderLabelSelector()}
            {this.renderMilestoneSelector()}
          </Row>

          <Row className="metadata-selectors">
            {this.renderProjectSelector()}
            {this.renderStatusSelector()}
            {this.renderIterationSelector()}
          </Row>

          {this.renderSelectedItems()}
        </DialogContent>

        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText="Create Task"
            okButtonDisabled={disabled}
          />
        </DialogFooter>
      </Dialog>
    )
  }
}
