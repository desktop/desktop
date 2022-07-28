import * as React from 'react'
import * as OcticonSymbol from '../octicons/octicons.generated'
import { FancyTextBox } from '../lib/fancy-text-box'
import { Select } from '../lib/select'
import { Octicon } from '../octicons'

export class PullRequestCompareBar extends React.Component<{}> {
  public render() {
    return (
      <div className="pull-request-compare-bar">
        <Octicon symbol={OcticonSymbol.gitCompare} />

        <div className="branch-box">
          <Select value={'development'}>
            <option key={'development'} value={'development'}>
              {'development'}
            </option>
          </Select>
        </div>

        <Octicon symbol={OcticonSymbol.arrowLeft} />

        <div className="branch-box">
          <FancyTextBox
            symbol={OcticonSymbol.gitBranch}
            type="search"
            value={'feature-branch'}
            disabled={true}
          />
        </div>
      </div>
    )
  }
}
