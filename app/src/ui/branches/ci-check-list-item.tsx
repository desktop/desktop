import * as React from 'react'
import { IRefCheck } from '../../lib/stores/commit-status-store'

import { Octicon } from '../octicons'
import { getClassNameForCheck, getSymbolForCheck } from './ci-status'
import classNames from 'classnames'

interface ICICheckListItemProps {
  /** The check ref  **/
  readonly checkRef: IRefCheck
}

/** The CI check list item. */
export class CICheckListItem extends React.PureComponent<
  ICICheckListItemProps
> {
  public render() {
    const { checkRef } = this.props

    return (
      <div className="ci-check-list-item">
        <div className="ci-check-status-symbol">
          <Octicon
            className={classNames(
              'ci-status',
              `ci-status-${getClassNameForCheck(checkRef)}`
            )}
            symbol={getSymbolForCheck(checkRef)}
            title={checkRef.description}
          />
        </div>

        <div className="ci-check-list-item-detail">
          <div className="ci-check-name">{checkRef.name}</div>
          <div className="ci-check-description" title={checkRef.description}>
            {checkRef.description}
          </div>
        </div>
      </div>
    )
  }
}
