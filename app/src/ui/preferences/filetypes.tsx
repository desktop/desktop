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
  readonly text: string
  extension: string
  cmd: string
  keep: boolean
  dirty: boolean
}

const FileTypeFilterList: new() => FilterList<IFileTypeItem> = FilterList as any

interface IFileTypeListProps {

  /**
   * See IBranchesState.allBranches
   */
  readonly allTypes: Array<IFileTypeItem> | null

  /**
   * The currently selected branch in the list, see the onSelectionChanged prop.
   */
  readonly selectedType: Object | null

  /**
   * Called when a key down happens in the filter field. Users have a chance to
   * respond or cancel the default behavior by calling `preventDefault`.
   */
  readonly onFilterKeyDown?: (filter: string, event: React.KeyboardEvent<HTMLInputElement>) => void

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
  readonly onSelectionChanged?: (selectedItem: Object | null, source: SelectionSource) => void
}

interface IFileTypeListState {
  readonly groups: any | null
  readonly selectedItem: IFileTypeItem | null
  readonly value: string
}

function createState(props: IFileTypeListProps): IFileTypeListState {

  const groups = new Array<IFilterListGroup<IFileTypeItem>>()
  groups.push( {
      identifier: 'default',
      items: (props.allTypes == null) ? new Array<IFileTypeItem>()
                                      : props.allTypes,
  } )
  return {
    groups: groups,
    selectedItem: null,
    value: 'item',
  }
}

export class FileTypeList extends React.Component<IFileTypeListProps, IFileTypeListState> {

  public constructor(props: IFileTypeListProps) {
    super(props)
    this.state = createState(props)
  }

  private renderGroupHeader = (identifier: string) => {
    return <div></div>
  }

  private onItemClick = (item: IFileTypeItem) => {
    if (this.props.onItemClick) {
      this.props.onItemClick(item)
    }
  }

  private onSelectionChanged = (selectedItem: IFileTypeItem | null, source: SelectionSource) => {
    if (this.props.onSelectionChanged) {
      this.props.onSelectionChanged(selectedItem ? selectedItem : null, source)
    }
    this.setState( { selectedItem })
  }

  private renderItem = (item: IFileTypeItem) => {
    return (
      <div className='extension-list-item'>
        <div>
          <Checkbox
            tabIndex={-1}
            label={item.extension + ' ' + item.text}
            value={item.keep ? CheckboxValue.On : CheckboxValue.Off}
          onChange={(event: React.FormEvent<HTMLInputElement>) => {
               const keep = event.currentTarget.checked
               item.keep = keep
               item.dirty = true
               this.setState( createState(this.props) )
          }}
          />
        </div>
        <TextBox
          value={item.cmd}
          placeholder='Command'
          autoFocus={true}
          onChange={(event: React.FormEvent<HTMLInputElement>) => {
               item.cmd = event.currentTarget.value
               item.dirty = true
               this.setState( createState(this.props) )
          }}
          />
      </div>
    )
  }

  private RowHeight(info: {index: number}): number {
    return info.index === 0 ? 0 : 47
  }

  private add = () => {
    // TODO: add to props.allTypes
    return () => {
    console.log(this)
    console.log(this.props)
    //this.setState( createState(this.props) )
    }
  }

  public render() {
    return (
      <DialogContent>
        <Row>
         <TextBox
            value={''}
            placeholder='Extension'
            autoFocus={true}
            />
          <TextBox
            value={''}
            placeholder='Command'
            autoFocus={true}
            />
           <Button onClick={this.add()}>{'Add'}</Button>
        </Row>
        <Row>
      <FileTypeFilterList
        className='extension-list-container'
        rowHeight={this.RowHeight}
        selectedItem={this.state.selectedItem}
        renderItem={this.renderItem}
        renderGroupHeader={this.renderGroupHeader}
        onItemClick={this.onItemClick}
        onFilterKeyDown={this.props.onFilterKeyDown}
        onSelectionChanged={this.onSelectionChanged}
        groups={this.state.groups}
        invalidationProps={null}/>
        </Row>
      </DialogContent>
    )
  }
}
