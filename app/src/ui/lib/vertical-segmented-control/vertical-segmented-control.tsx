import * as React from 'react'
import { createUniqueId, releaseUniqueId } from '../id-pool'
import { SegmentedItem } from './segmented-item'

/**
 * An item which is rendered as a choice in the segmented control.
 */
export interface ISegmentedItem {
  /**
   * The title for the segmented item. This should be kept short.
   */
  readonly title: string

  /**
   * An optional description which explains the consequences of
   * selecting this item.
   */
  readonly description?: string
}

interface IVerticalSegmentedControlProps {
  /**
   * An optional label for the segmented control. Will be rendered
   * as a legend element inside a field group. Consumers are strongly
   * encouraged to use this in order to aid accessibility.
   */
  readonly label?: string

  /**
   * A set of items to be rendered as choices in the segmented control.
   * An item must have a title and may (encouraged) also have a description
   * which explains what the consequences of selecting the items are.
   */
  readonly items: ReadonlyArray<ISegmentedItem>

  /**
   * The currently selected item, denoted by its position in the items
   * array.
   */
  readonly selectedIndex: number

  /**
   * A function that's called whenever the selected item index changes, either
   * as a result of a click using a pointer device or as a result of the user
   * hitting an up/down while the component has focus.
   */
  readonly onSelectionChanged: (selectedIndex: number) => void
}

interface IVerticalSegmentedControlState {
  /**
   * An automatically generated id for the list element used to reference
   * it from the label element. This is generated once via the id pool when the
   * component is mounted and then released once the component unmounts.
   */
  readonly listId?: string
}

/**
 * A component for presenting a small number of choices to the user. Equivalent
 * of a radio button group but styled as a vertically oriented segmented control.
 */
export class VerticalSegmentedControl extends React.Component<
  IVerticalSegmentedControlProps,
  IVerticalSegmentedControlState
> {
  private listRef: HTMLUListElement | null = null
  private formRef: HTMLFormElement | null = null

  public constructor(props: IVerticalSegmentedControlProps) {
    super(props)
    this.state = {}
  }

  private updateListId(label: string | undefined) {
    if (this.state.listId) {
      releaseUniqueId(this.state.listId)
      this.setState({ listId: undefined })
    }

    if (label) {
      this.setState({
        listId: createUniqueId(`VerticalSegmentedControl_${label}`),
      })
    }
  }

  public componentWillMount() {
    this.updateListId(this.props.label)
  }

  public componentWillUnmount() {
    if (this.state.listId) {
      releaseUniqueId(this.state.listId)
    }
  }

  public componentWillReceiveProps(nextProps: IVerticalSegmentedControlProps) {
    if (this.props.label !== nextProps.label) {
      this.updateListId(nextProps.label)
    }
  }

  private onItemClick = (index: number) => {
    if (index !== this.props.selectedIndex) {
      this.props.onSelectionChanged(index)
    }
  }

  private getListItemId(index: number) {
    return `${this.state.listId}_Item_${index}`
  }

  private renderItem(item: ISegmentedItem, index: number, selected: boolean) {
    return (
      <SegmentedItem
        id={this.getListItemId(index)}
        key={index}
        title={item.title}
        description={item.description}
        index={index}
        isSelected={selected}
        onClick={this.onItemClick}
      />
    )
  }

  private onKeyDown = (event: React.KeyboardEvent<HTMLUListElement>) => {
    if (event.key === 'ArrowUp') {
      if (this.props.selectedIndex > 0) {
        this.props.onSelectionChanged(this.props.selectedIndex - 1)
      }
      event.preventDefault()
    } else if (event.key === 'ArrowDown') {
      if (this.props.selectedIndex < this.props.items.length - 1) {
        this.props.onSelectionChanged(this.props.selectedIndex + 1)
      }
      event.preventDefault()
    } else if (event.key === 'Enter') {
      const form = this.formRef
      if (form) {
        // NB: In order to play nicely with React's custom event dispatching,
        // we dispatch an event instead of calling `submit` directly on the
        // form.
        form.dispatchEvent(new Event('submit'))
      }
    }
  }

  private onListRef = (ref: HTMLUListElement | null) => {
    this.listRef = ref
  }

  private onFieldsetRef = (ref: HTMLFieldSetElement | null) => {
    this.formRef = ref ? ref.form : null
  }

  private onLegendClick = () => {
    if (this.listRef) {
      this.listRef.focus()
    }
  }

  public render() {
    if (!this.props.items.length) {
      return null
    }

    const selectedIndex = this.props.selectedIndex
    const label = this.props.label ? (
      <legend onClick={this.onLegendClick}>{this.props.label}</legend>
    ) : (
      undefined
    )

    const activeDescendant = this.getListItemId(selectedIndex)

    // Using a fieldset with a legend seems to be the way to go here since
    // we can't use a label to point to a list (https://developer.mozilla.org/en-US/docs/Web/Guide/HTML/Content_categories#Form_labelable).
    // See http://stackoverflow.com/a/13273907/2114
    return (
      <fieldset className="vertical-segmented-control" ref={this.onFieldsetRef}>
        {label}
        <ul
          ref={this.onListRef}
          id={this.state.listId}
          className="vertical-segmented-control"
          tabIndex={0}
          onKeyDown={this.onKeyDown}
          role="radiogroup"
          aria-activedescendant={activeDescendant}
        >
          {this.props.items.map((item, index) =>
            this.renderItem(item, index, index === selectedIndex)
          )}
        </ul>
      </fieldset>
    )
  }
}
