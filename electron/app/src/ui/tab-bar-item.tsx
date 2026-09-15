import * as React from 'react'
import classNames from 'classnames'
import { TabBarType } from './tab-bar-type'

interface ITabBarItemProps {
  readonly index: number
  readonly selected: boolean
  readonly onClick: (index: number) => void
  readonly onMouseEnter: (index: number) => void
  readonly onMouseLeave: () => void
  readonly onSelectAdjacent: (
    direction: 'next' | 'previous',
    index: number
  ) => void
  readonly onButtonRef: (
    index: number,
    button: HTMLButtonElement | null
  ) => void
  readonly type?: TabBarType
}

export class TabBarItem extends React.Component<ITabBarItemProps, {}> {
  private onClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    this.props.onClick(this.props.index)
  }

  private onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const { type, index } = this.props
    const previousKey = type === TabBarType.Vertical ? 'ArrowUp' : 'ArrowLeft'
    const nextKey = type === TabBarType.Vertical ? 'ArrowDown' : 'ArrowRight'
    if (event.key === previousKey) {
      this.props.onSelectAdjacent('previous', index)
      event.preventDefault()
    } else if (event.key === nextKey) {
      this.props.onSelectAdjacent('next', index)
      event.preventDefault()
    }
  }

  private onButtonRef = (buttonRef: HTMLButtonElement | null) => {
    this.props.onButtonRef(this.props.index, buttonRef)
  }

  private onMouseEnter = () => {
    this.props.onMouseEnter(this.props.index)
  }

  public render() {
    const selected = this.props.selected
    const className = classNames('tab-bar-item', { selected })
    return (
      <button
        ref={this.onButtonRef}
        className={className}
        onClick={this.onClick}
        role="tab"
        aria-selected={selected}
        tabIndex={selected ? undefined : -1}
        onKeyDown={this.onKeyDown}
        onMouseEnter={this.onMouseEnter}
        onMouseLeave={this.props.onMouseLeave}
        type="button"
      >
        {this.props.children}
      </button>
    )
  }
}
