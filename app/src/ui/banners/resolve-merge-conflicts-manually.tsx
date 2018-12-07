import * as React from 'react'
import { Octicon, OcticonSymbol } from '../octicons'
import { Banner } from './banner'
import { Dispatcher } from '../../lib/dispatcher'
import { Popup } from '../../models/popup'

export function ResolveMergeConflictsManually({
  dispatcher,
  ourBranch,
  popup,
  onDismissed,
}: {
  readonly dispatcher: Dispatcher
  readonly ourBranch: string
  readonly popup: Popup
  readonly onDismissed: () => void
}) {
  return (
    <Banner id="successful-merge" onDismissed={onDismissed}>
      <Octicon className="alert-icon" symbol={OcticonSymbol.alert} />
      <div className="banner-message">
        Resolve conflicts and commit to merge into <strong>{ourBranch}</strong>
        <a onClick={() => dispatcher.showPopup(popup)}>View conflicts</a>
      </div>
    </Banner>
  )
}
