import * as React from 'react'

interface IChangedFileDetailsProps {
  readonly filePath: string | null
}

export class ChangedFileDetails extends React.Component<IChangedFileDetailsProps, void> {
  public render() {
    const filePath = this.props.filePath ? this.props.filePath : undefined

    return (
      <div id='changed-file-details'>
        {filePath}
      </div>
    )
  }
}