import * as React from 'react'

interface IChangedFileDetailsProps {
  readonly filePath: string
}

/** Displays information about a file */
export class ChangedFileDetails extends React.Component<IChangedFileDetailsProps, void> {
  public render() {
    const filePath = this.props.filePath

    return (
      <div className='changed-file-details'>
        {filePath}
      </div>
    )
  }
}
