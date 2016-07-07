import * as React from 'react'

interface ChangedFileProps {
  path: string
}

interface ChangedFileState {

}

export default class ChangedFile extends React.Component<ChangedFileProps, ChangedFileState> {

  public constructor(props: ChangedFileProps) {
    super(props)
  }

  public render() {
    return (
        <li>{this.props.path}</li>
    )
  }
}
