import * as React from 'react'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { CopyButton } from '../copy-button'
import {
  ISecretLocation,
  ISecretScanResult,
} from './push-protection-error-dialog'
import { PathText } from '../lib/path-text'
import { Button } from '../lib/button'

interface IPushProtectionErrorLocationProps {
  readonly secret: ISecretScanResult
}

interface IPushProtectionErrorLocationState {
  readonly showMoreLocations: boolean
}

/**
 * The dialog shown when a push is denied by GitHub's push protection feature of secret scanning.
 */
export class PushProtectionErrorLocation extends React.Component<
  IPushProtectionErrorLocationProps,
  IPushProtectionErrorLocationState
> {
  public constructor(props: IPushProtectionErrorLocationProps) {
    super(props)
    this.state = {
      showMoreLocations: false,
    }
  }

  private onClickShowMoreLocations = () => {
    this.setState({ showMoreLocations: !this.state.showMoreLocations })
  }

  private renderLocation(location: ISecretLocation, isFirst: boolean = false) {
    return (
      <span className="secret-location-details">
        <span className="commit-sha">
          <Octicon symbol={octicons.gitCommit} />
          <span className="ref selectable-text">
            {location.commitSha.substring(0, 7)}
          </span>
          <CopyButton
            ariaLabel="Copy the full SHA"
            copyContent={location.commitSha}
          />
        </span>
        <span className="secret-path">
          <span className="ref selectable-text">
            <PathText
              path={location.path}
              availableWidth={isFirst ? 200 : 275}
            />
            at line {location.lineNumber}
          </span>
        </span>
      </span>
    )
  }

  public render() {
    const { secret } = this.props
    const { showMoreLocations } = this.state
    const firstLocation = secret.locations.at(0)
    const showMoreLocationsToggle = secret.locations.length > 1
    const toggleText = showMoreLocations
      ? 'Show Less Locations'
      : 'Show More locations'
    if (firstLocation === undefined) {
      return null
    }

    return (
      <span className="secret-location">
        <span className="first-location">
          {this.renderLocation(firstLocation, true)}
          {showMoreLocationsToggle && (
            <Button
              tooltip={toggleText}
              ariaLabel={toggleText}
              onClick={this.onClickShowMoreLocations}
            >
              <Octicon symbol={octicons.kebabHorizontal} />
            </Button>
          )}
        </span>

        {showMoreLocations && (
          <>
            {secret.locations.map((location, index) => {
              if (index === 0) {
                return null
              }
              return this.renderLocation(location)
            })}
          </>
        )}
      </span>
    )
  }
}
