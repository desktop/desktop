import * as React from 'react'
import { Row } from '../lib/row'
import { Select } from '../lib/select'
import { ILocationList } from './open-repository-in-vscode'

interface ISelectFromLocationListProps {
  /** The location list to open the repository in Visual Studio Code */
  readonly locationList: ILocationList[]

  readonly selectedLocationPath: string
  readonly onChanged: (location: string) => void
}

export class SelectFromLocationList extends React.Component<
  ISelectFromLocationListProps
> {
  public constructor(props: ISelectFromLocationListProps) {
    super(props)
  }

  private onLocationChange = (event: React.FormEvent<HTMLSelectElement>) => {
    const location = event.currentTarget.value

    this.props.onChanged(location)
  }

  public render() {
    const darwinLabel = 'Select Location To Open The Repository'
    const windowsLabel = 'Select location to open the repository'

    return (
      <Row>
        <Select
          label={__DARWIN__ ? darwinLabel : windowsLabel}
          value={this.props.selectedLocationPath}
          onChange={this.onLocationChange}
        >
          {this.props.locationList.map((file, index) => (
            <option key={index} value={file.path}>
              {file.locationName}
            </option>
          ))}
        </Select>
      </Row>
    )
  }
}
