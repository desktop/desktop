import * as React from 'react'
import { IRefCheck } from '../../lib/stores/commit-status-store'

import { Octicon } from '../octicons'
import { getClassNameForCheck, getSymbolForCheck } from './ci-status'
import classNames from 'classnames'

interface ICICheckRunListItemProps {
  /** The check run to display **/
  readonly checkRun: IRefCheck
}

/** The CI check list item. */
export class CICheckRunListItem extends React.PureComponent<
  ICICheckRunListItemProps
> {
  public render() {
    const { checkRun } = this.props

    return (
      <div className="ci-check-list-item">
        <div className="ci-check-status-symbol">
          <Octicon
            className={classNames(
              'ci-status',
              `ci-status-${getClassNameForCheck(checkRun)}`
            )}
            symbol={getSymbolForCheck(checkRun)}
            title={checkRun.description}
          />
        </div>

        <div className="ci-check-list-item-detail">
          <div className="ci-check-name">{checkRun.name}</div>
          <div className="ci-check-description" title={checkRun.description}>
            {checkRun.description}
          </div>
        </div>
      </div>
    )
  }
}
