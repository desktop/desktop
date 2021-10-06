import * as React from 'react'
import * as ReactDOM from 'react-dom'
import { ObservableRef } from './observable-ref'
import { createUniqueId, releaseUniqueId } from './id-pool'

interface ITooltipProps {
  readonly target: ObservableRef<HTMLElement>
}

export class Tooltip extends React.Component<ITooltipProps> {
  private static globalWrapper: HTMLDivElement | null = null

  private container: HTMLDivElement | null = null

  public constructor(props: ITooltipProps) {
    super(props)
  }

  public componentDidMount() {
    if (Tooltip.globalWrapper === null) {
      Tooltip.globalWrapper = document.createElement('div')
      Tooltip.globalWrapper.classList.add('tooltips')
      document.body.appendChild(Tooltip.globalWrapper)
    }

    this.props.target.subscribe(this.onTargetRef)

    this.container = document.createElement('div')
    this.container.classList.add('tooltip')
    this.container.style.position = 'absolute'
    this.container.id = createUniqueId('tooltip')

    Tooltip.globalWrapper.appendChild(this.container)
  }

  public onTargetRef = (elem: HTMLElement | null) => {
    if (elem && this.container) {
      const rect = elem.getBoundingClientRect()
      this.container.style.left = `${rect.left}px`
      this.container.style.top = `${rect.top}px`
    }
  }

  public componentDidUpdate(prevProps: ITooltipProps) {
    if (prevProps.target !== this.props.target) {
      prevProps.target.unsubscribe(this.onTargetRef)
      this.props.target.subscribe(this.onTargetRef)
    }
  }

  public componentWillUnmount() {
    this.props.target.unsubscribe(this.onTargetRef)

    if (this.container !== null) {
      ReactDOM.unmountComponentAtNode(this.container)

      releaseUniqueId(this.container.id)
      this.container.remove()
      this.container = null
    }

    if (Tooltip.globalWrapper?.childElementCount === 0) {
      Tooltip.globalWrapper.remove()
      Tooltip.globalWrapper = null
    }
  }

  public render() {
    return this.container
      ? ReactDOM.createPortal(this.props.children, this.container)
      : null
  }
}
