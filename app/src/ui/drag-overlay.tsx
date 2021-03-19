import * as React from 'react'
import { dragAndDropManager } from '../lib/drag-and-drop-manager'
import { PopoverCaretPosition } from './lib/popover'

// time till we prompt the user about where to drag in seconds
const dragPromptWaitTime = 2500
interface IDragOverlayProps {
  readonly dragZoneDescription: string
}

interface IDragOverlayState {
  readonly showDragPrompt: boolean
}

export class DragOverlay extends React.Component<
  IDragOverlayProps,
  IDragOverlayState
> {
  private timeoutId: number | null = null

  public constructor(props: IDragOverlayProps) {
    super(props)

    this.state = {
      showDragPrompt: false,
    }
  }

  private clearDragPromptTimeOut = () => {
    if (this.timeoutId !== null) {
      window.clearTimeout(this.timeoutId)
    }
  }

  /** If drop zone is entered, hide drag prompts */
  private dragZoneEntered = (dropZoneDescription: string) => {
    if (this.props.dragZoneDescription === dropZoneDescription) {
      this.clearDragPromptTimeOut()
      this.setState({ showDragPrompt: false })
    }
  }

  public componentWillMount = () => {
    // sets timer to wait before prompting the user on where it drag
    this.timeoutId = window.setTimeout(() => {
      this.setState({ showDragPrompt: true })
    }, dragPromptWaitTime)
    dragAndDropManager.onEnterDragZone(this.dragZoneEntered)
  }

  public componentWillUnmount = () => {
    this.clearDragPromptTimeOut()
  }

  private renderDragPrompt(): JSX.Element | null {
    if (!this.state.showDragPrompt) {
      return null
    }

    // This acts more as a tool tip as we don't want to use the focus trap as in
    // the Popover component. However, we wanted to use its styles.
    const className = `popover-component popover-caret-${PopoverCaretPosition.TopLeft}`
    return (
      <div className={className}>
        Drag to a branch in the branch menu to copy your commits
      </div>
    )
  }

  public render() {
    return <div id="drag-overlay">{this.renderDragPrompt()}</div>
  }
}
