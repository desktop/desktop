import * as React from 'react'

import { Button } from '../lib/button'
import { Octicon, OcticonSymbol } from '../octicons'
import * as octicons from '../octicons/octicons.generated'

const DropdownItemClassName = 'open-repository-dropdown-item'

interface IOpenRepositoryButtonDropdownProps {
  readonly isVisualStudioCodeAvailable: boolean
  readonly isVisualStudioAvailable: boolean
  readonly shellLabel: string
  readonly openInVisualStudioCode: () => void
  readonly openInVisualStudio: () => void
  readonly openInShell: () => void
  readonly showInExplorer: () => void
}

interface IOpenRepositoryDropdownItem {
  readonly title: string
  readonly description: string
  readonly icon: OcticonSymbol
  readonly enabled: boolean
  readonly action: () => void
}

export class OpenRepositoryButtonDropdown extends React.Component<IOpenRepositoryButtonDropdownProps> {
  private buttonsContainerRef: HTMLDivElement | null = null

  public componentDidMount() {
    window.addEventListener('keydown', this.onDropdownKeyDown)
  }

  public componentWillUnmount() {
    window.removeEventListener('keydown', this.onDropdownKeyDown)
  }

  private onButtonsContainerRef = (ref: HTMLDivElement | null) => {
    this.buttonsContainerRef = ref
  }

  private onDropdownKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
      return
    }

    event.preventDefault()
    const items = this.buttonsContainerRef?.querySelectorAll<HTMLElement>(
      `.${DropdownItemClassName}:not(:disabled)`
    )

    if (items === undefined || items.length === 0) {
      return
    }

    const focusedItem =
      this.buttonsContainerRef?.querySelector<HTMLElement>(':focus')
    const focusedIndex = focusedItem
      ? Array.from(items).indexOf(focusedItem)
      : -1
    const nextIndex =
      event.key === 'ArrowDown' ? focusedIndex + 1 : focusedIndex - 1
    const nextItem = items[(nextIndex + items.length) % items.length]
    nextItem?.focus()
  }

  private renderDropdownItem = (item: IOpenRepositoryDropdownItem) => (
    <Button
      className={DropdownItemClassName}
      key={item.title}
      onClick={item.action}
      disabled={!item.enabled}
    >
      <Octicon symbol={item.icon} />
      <div className="text-container">
        <div className="title">{item.title}</div>
        <div className="detail">{item.description}</div>
      </div>
    </Button>
  )

  public render() {
    const items: ReadonlyArray<IOpenRepositoryDropdownItem> = [
      {
        title: 'Open in Visual Studio Code',
        description: 'Open the repository in Visual Studio Code.',
        icon: octicons.code,
        enabled: this.props.isVisualStudioCodeAvailable,
        action: this.props.openInVisualStudioCode,
      },
      {
        title: 'Open in Visual Studio IDE',
        description: 'Open the solution or C# project in Visual Studio.',
        icon: octicons.codeSquare,
        enabled: this.props.isVisualStudioAvailable,
        action: this.props.openInVisualStudio,
      },
      {
        title: `Open in ${this.props.shellLabel}`,
        description: `Open ${this.props.shellLabel} for this repository.`,
        icon: octicons.terminal,
        enabled: true,
        action: this.props.openInShell,
      },
      {
        title: 'Show in Explorer',
        description: 'View the files of your repository in Explorer.',
        icon: octicons.fileDirectory,
        enabled: true,
        action: this.props.showInExplorer,
      },
    ]

    return (
      <div
        className="open-repository-dropdown"
        ref={this.onButtonsContainerRef}
      >
        {items.map(this.renderDropdownItem)}
      </div>
    )
  }
}
