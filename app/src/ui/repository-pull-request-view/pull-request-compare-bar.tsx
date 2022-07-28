import * as React from 'react'
import * as OcticonSymbol from '../octicons/octicons.generated'
import { FancyTextBox } from '../lib/fancy-text-box'
import { Select } from '../lib/select'
import { Octicon } from '../octicons'
import { Branch } from '../../models/branch'

interface IPullRequestCompareBarProps {
  readonly branches: ReadonlyArray<Branch>
  readonly currentBranch: Branch
  readonly mergeBaseBranch: Branch
}

export class PullRequestCompareBar extends React.Component<IPullRequestCompareBarProps> {
  public render() {
    return (
      <div className="pull-request-compare-bar">
        <Octicon symbol={OcticonSymbol.gitCompare} />

        <div className="branch-box">
          <Select defaultValue={this.props.mergeBaseBranch.name}>
            {this.props.branches.map(branch => (
              <option key={branch.name} value={branch.name}>
                {branch.name}
              </option>
            ))}
          </Select>
        </div>

        <Octicon symbol={OcticonSymbol.arrowLeft} />

        <div className="branch-box">
          <FancyTextBox
            symbol={OcticonSymbol.gitBranch}
            type="search"
            value={this.props.currentBranch.name}
            disabled={true}
          />
        </div>
      </div>
    )
  }
}
