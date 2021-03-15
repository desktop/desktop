import * as React from 'react'

interface IDraggableProps {
  readonly onDragStart: () => void
  readonly onDragEnd: (landedOnExpectedTarget: boolean) => void
  readonly onRenderDragElement: () => void
  readonly onRemoveDragElement: () => void
  readonly isEnabled: boolean
}

export class Draggable extends React.Component<IDraggableProps> {
  public render() {
    return <>{this.props.children}</>
  }
}
