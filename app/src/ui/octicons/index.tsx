import * as React from 'react'

import { Octicon } from './octicon'
import { OcticonSymbol } from './octicons.generated'

export { Octicon } from './octicon'
export { OcticonSymbol } from './octicons.generated'

import { FileStatus, mapStatus } from '../../models/status'
import { assertNever } from '../../lib/fatal-error'

function iconForStatus(status: FileStatus): OcticonSymbol {

  switch (status) {
    case FileStatus.New: return OcticonSymbol.diffAdded
    case FileStatus.Modified: return OcticonSymbol.diffModified
    case FileStatus.Deleted: return OcticonSymbol.diffRemoved
    case FileStatus.Renamed: return OcticonSymbol.diffRenamed
    case FileStatus.Conflicted: return OcticonSymbol.alert
    case FileStatus.Copied: return OcticonSymbol.diffAdded
  }

  return assertNever(status, `Unknown file status ${status}`)
}

export function renderOcticon(status: FileStatus) {
  const fileStatus = mapStatus(status)
  return (
    <div className={'status status-' + fileStatus.toLowerCase()} title={fileStatus}>
        <Octicon symbol={iconForStatus(status)} />
    </div>
  )
}
