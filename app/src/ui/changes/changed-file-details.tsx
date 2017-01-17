import * as React from 'react'

interface IChangedFileDetailsProps {
  readonly fileName: string | null
}

export class ChangedFileDetails extends React.Component<IChangedFileDetailsProps, void> {
  public render() {
    const fullFileName = this.props.fileName ? this.props.fileName : undefined

    return (
      <div id='changed-file-details'>
        {fullFileName}
      </div>
    )
  }
}