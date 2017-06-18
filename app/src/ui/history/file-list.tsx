import * as React from 'react'
import { FileChange, mapStatus, iconForStatus } from '../../models/status'
import { PathLabel } from '../lib/path-label'
import { Octicon } from '../octicons'
import { FilterList, IFilterListGroup, IFilterListItem } from '../lib/filter-list'

/**
 * TS can't parse generic specialization in JSX, so we have to alias it here
 * with the generic type. See https://github.com/Microsoft/TypeScript/issues/6395.
 */
const FileFilterList: new() => FilterList<IFileListItem> = FilterList as any

interface IFileListItem extends IFilterListItem {
  readonly text: string
  readonly id: string
  readonly file: FileChange
}

interface IFileListProps {
  readonly files: ReadonlyArray<FileChange>
  readonly selectedFile: FileChange | null
  readonly onSelectedFileChanged: (file: FileChange) => void
  readonly availableWidth: number
}

export class FileList extends React.Component<IFileListProps, void> {
  private onSelectionChanged = (selectedItem: IFileListItem | null) => {
    if (selectedItem) {
      const { file } = selectedItem
      this.props.onSelectedFileChanged(file)
    }
  }

  private renderFile = ({ file }: IFileListItem) => {
    const status = file.status
    const fileStatus = mapStatus(status)



    const listItemPadding = 10 * 2
    const statusWidth = 16
    const filePathPadding = 5
    const availablePathWidth = this.props.availableWidth - listItemPadding - filePathPadding - statusWidth

    return <div className='file'>

      <PathLabel
        path={file.path}
        oldPath={file.oldPath}
        status={file.status}
        availableWidth={availablePathWidth}
      />

      <Octicon
        symbol={iconForStatus(status)}
        className={'status status-' + fileStatus.toLowerCase()}
        title={fileStatus}
      />

    </div>
  }

  private rowForFile(file: FileChange | null): number {
    return file
      ? this.props.files.findIndex(f => f.path === file.path)
      : -1
  }

  private get listGroups(): ReadonlyArray<IFilterListGroup<IFileListItem>> {
    return [
      {
        identifier: 'files',
        hasHeader: false,
        items: this.props.files.map(file => ({
          id: file.id,
          text: [ file.oldPath, file.path ].filter(x => x).join(' '),
          file,
        })),
      },
    ]
  }

  public render() {
    return (
      <div className='file-list'>
        <FileFilterList
          autoFocus={false}
          groups={this.listGroups}
          renderItem={this.renderFile}
          rowHeight={29}
          selectedItem={this.listGroups[0].items[this.rowForFile(this.props.selectedFile)]}
          invalidationProps={this.props.files}
          onSelectionChanged={this.onSelectionChanged}/>
      </div>
    )
  }
}
