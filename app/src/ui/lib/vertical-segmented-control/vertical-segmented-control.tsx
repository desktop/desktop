import * as React from 'react'
import { SegmentedItem } from './segmented-item'
import { RadioGroup } from '../radio-group'

/**
 * An item which is rendered as a choice in the segmented control.
 */
export interface ISegmentedItem<T extends React.Key> {
  /**
   * The title for the segmented item. This should be kept short.
   */
  readonly title: string

  /**
   * An optional description which explains the consequences of
   * selecting this item.
   */
  readonly description?: string | JSX.Element

  /**
   * The key to use for that item. This key will be passed as
   * the first argument of onSelectionChanged() when the item gets
   * selected.
   *
   * Note that keys should be unique so there can't be two items on
   * the same <VerticalSegmentedControl /> component with the same key.
   */
  readonly key: T
}

interface IVerticalSegmentedControlProps<T extends React.Key> {
  /**
   * A label for the radio group.
   */
  readonly label: string

  /**
   * A set of items to be rendered as choices in the segmented control.
   * An item must have a title and may (encouraged) also have a description
   * which explains what the consequences of selecting the items are.
   */
  readonly items: ReadonlyArray<ISegmentedItem<T>>

  /**
   * The currently selected item, denoted by its key.
   */
  readonly selectedKey: T

  /**
   * A function that's called whenever the selected item changes, either
   * as a result of a click using a pointer device or as a result of the user
   * hitting an up/down while the component has focus.
   *
   * The key argument corresponds to the key property of the selected item.
   */
  readonly onSelectionChanged: (key: T) => void
}

/**
 * A component for presenting a small number of choices to the user. Equivalent
 * of a radio button group but styled as a vertically oriented segmented control.
 */
export class VerticalSegmentedControl<
  T extends React.Key
> extends React.Component<IVerticalSegmentedControlProps<T>> {
  private onFieldsetRef = React.createRef<HTMLFieldSetElement>()

  private onRadioButtonDoubleClick = (key: T) => {
    this.onFieldsetRef.current?.form?.dispatchEvent(new Event('submit'))
  }

  private renderItem = (key: T) => {
    const item = this.props.items.find(item => item.key === key)
    if (!item) {
      return <span>{key}</span>
    }

    return (
      <SegmentedItem
        key={item.key}
        title={item.title}
        description={item.description}
      />
    )
  }

  private onSelectionChanged = (key: T) => {
    this.props.onSelectionChanged(key)
  }

  public render() {
    if (this.props.items.length === 0) {
      return null
    }

    return (
      <fieldset className="vertical-segmented-control" ref={this.onFieldsetRef}>
        <legend id="vertical-segment-control-label">{this.props.label}</legend>

        <RadioGroup<T>
          ariaLabelledBy="vertical-segment-control-label"
          className="vertical-segmented-control"
          selectedKey={this.props.selectedKey}
          radioButtonKeys={this.props.items.map(item => item.key)}
          onSelectionChanged={this.onSelectionChanged}
          renderRadioButtonLabelContents={this.renderItem}
          onRadioButtonDoubleClick={this.onRadioButtonDoubleClick}
        />
      </fieldset>
    )
  }
}
