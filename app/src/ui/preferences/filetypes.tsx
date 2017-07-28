import * as React from 'react'
//import { Row } from '../lib/row'
import { DialogContent } from '../dialog'
import { FilterList, SelectionSource } from '../lib/filter-list'
import { IFilterListItem, IFilterListGroup } from '../lib/filter-list'
import { TextBox } from '../lib/text-box'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { Row } from '../../ui/lib/row'
import { Button } from '../lib/button'

// const RowHeight = 47

export interface IFileTypeItem extends IFilterListItem {
  readonly id: string
  text: string
  extension: string
  cmd: string
  keep: boolean
  dirty: boolean
}

const FileTypeFilterList: new () => FilterList<
  IFileTypeItem
> = FilterList as any

interface IFileTypeListProps {
  /**
   * List of editors by file extension
   */
  readonly allTypes: Array<IFileTypeItem>

  /**
   * The currently selected branch in the list, see the onSelectionChanged prop.
   */
  readonly selectedType: Object | null

  /**
   * Called when a key down happens in the filter field. Users have a chance to
   * re-spond or cancel the default behavior by calling `preventDefault`.
   */
  readonly onFilterKeyDown?: (
    filter: string,
    event: React.KeyboardEvent<HTMLInputElement>
  ) => void

  /** Called when an item is clicked. */
  readonly onItemClick?: (item: Object) => void

  /**
   * This function will be called when the selection changes as a result of a
   * user keyboard or mouse action (i.e. not when props change). Note that this
   * differs from `onRowSelected`. For example, it won't be called if an already
   * selected row is clicked on.
   *
   * @param selectedItem - The Branch that was just selected
   * @param source       - The kind of user action that provoked the change,
   *                       either a pointer device press, or a keyboard event
   *                       (arrow up/down)
   */
  readonly onSelectionChanged?: (
    selectedItem: Object | null,
    source: SelectionSource
  ) => void
}

interface IFileTypeListState {
  readonly groups: any | null
  readonly selectedItem: IFileTypeItem | null
  readonly value: string
  readonly newEntry: IFileTypeItem
}

function createState(
  props: IFileTypeListProps,
  newEntry: IFileTypeItem | null
): IFileTypeListState {
  const defaultEntry: IFileTypeItem = {
    id: '',
    text: '',
    extension: '',
    cmd: '',
    keep: true,
    dirty: true,
  }
  const groups = new Array<IFilterListGroup<IFileTypeItem>>()
  groups.push({
    identifier: 'default',
    items: props.allTypes,
  })

  return {
    groups: groups,
    selectedItem: null,
    value: 'item',
    newEntry: newEntry === null ? defaultEntry : newEntry,
  }
}

export class FileTypeList extends React.Component<
  IFileTypeListProps,
  IFileTypeListState
> {
  public constructor(props: IFileTypeListProps) {
    super(props)
    this.state = createState(props, null)
  }

  private renderGroupHeader = (identifier: string) => {
    return <div />
  }

  private onItemClick = (item: IFileTypeItem) => {
    if (this.props.onItemClick) {
      this.props.onItemClick(item)
    }
  }

  private onSelectionChanged = (
    selectedItem: IFileTypeItem | null,
    source: SelectionSource
  ) => {
    if (this.props.onSelectionChanged) {
      this.props.onSelectionChanged(selectedItem ? selectedItem : null, source)
    }
    this.setState({ selectedItem })
  }

  private removeEntry = (item: IFileTypeItem) => {
    return (event: React.FormEvent<HTMLInputElement>) => {
      const keep = event.currentTarget.checked
      item.keep = keep
      item.dirty = true
      this.setState(createState(this.props, this.state.newEntry))
    }
  }

  private updateCommand = (item: IFileTypeItem) => {
    return (event: React.FormEvent<HTMLInputElement>) => {
      item.cmd = event.currentTarget.value
      item.dirty = true
      this.setState(createState(this.props, this.state.newEntry))
    }
  }

  private renderItem = (item: IFileTypeItem) => {
    return (
      <div className="extension-list-item">
        <div>
          <Checkbox
            tabIndex={-1}
            label={item.extension + ' ' + item.text}
            value={item.keep ? CheckboxValue.On : CheckboxValue.Off}
            onChange={this.removeEntry(item)}
          />
        </div>
        <TextBox
          value={item.cmd}
          placeholder="Command"
          autoFocus={true}
          onChange={this.updateCommand(item)}
        />
      </div>
    )
  }

  private RowHeight(info: { index: number }): number {
    return info.index === 0 ? 0 : 47
  }

  private add = () => {
    // TODO: add to props.allTypes
    return () => {
      const e: IFileTypeItem = {
        id: this.state.newEntry.id,
        text: this.state.newEntry.text,
        cmd: this.state.newEntry.cmd,
        extension: this.state.newEntry.extension,
        dirty: true,
        keep: true,
      }
      this.props.allTypes.push(e)
      console.log(this.props)
      this.setState(createState(this.props, this.state.newEntry))
    }
  }

  private changeExtension = (event: React.FormEvent<HTMLInputElement>) => {
    const value = event.currentTarget.value

    const newEntry: IFileTypeItem = this.state.newEntry
    newEntry.extension = value

    this.setState(createState(this.props, newEntry))
    // this.props.extension = value
  }

  private changeCommand = (event: React.FormEvent<HTMLInputElement>) => {
    const value = event.currentTarget.value
    const newEntry: IFileTypeItem = this.state.newEntry
    newEntry.cmd = value
    this.setState(createState(this.props, newEntry))
    // this.props.command = value
  }

  private changeName = (event: React.FormEvent<HTMLInputElement>) => {
    const value = event.currentTarget.value
    const newEntry: IFileTypeItem = this.state.newEntry
    newEntry.text = value
    this.setState(createState(this.props, newEntry))
    // this.props.command = value
  }

  public render() {
    return (
      <DialogContent>
        <Row>
          <TextBox
            value={this.state.newEntry.extension}
            placeholder="Extension"
            autoFocus={true}
            onChange={this.changeExtension}
          />
          <TextBox
            value={this.state.newEntry.text}
            placeholder="Name"
            autoFocus={true}
            onChange={this.changeName}
          />
          <TextBox
            value={this.state.newEntry.cmd}
            placeholder="Command"
            autoFocus={true}
            onChange={this.changeCommand}
          />
          <Button onClick={this.add()}>
            {'Add'}
          </Button>
        </Row>
        <Row>
          <FileTypeFilterList
            className="extension-list-container"
            rowHeight={this.RowHeight}
            selectedItem={this.state.selectedItem}
            renderItem={this.renderItem}
            renderGroupHeader={this.renderGroupHeader}
            onItemClick={this.onItemClick}
            onFilterKeyDown={this.props.onFilterKeyDown}
            onSelectionChanged={this.onSelectionChanged}
            groups={this.state.groups}
            invalidationProps={null}
          />
        </Row>
      </DialogContent>
    )
  }
}
