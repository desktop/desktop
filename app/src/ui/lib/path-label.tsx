import * as React from 'react'

import { FileStatus } from '../../models/status'
import { Octicon, OcticonSymbol } from '../octicons'

export function renderPath(file: { path: string, oldPath?: string, status: FileStatus}) {
  const props: React.HTMLProps<HTMLLabelElement> = {
    className: 'path',
    title: file.path,
  }

  if (file.status === FileStatus.Renamed && file.oldPath) {
    return (
      <label {...props}>
        {file.oldPath} <Octicon symbol={OcticonSymbol.arrowRight} /> {file.path}
      </label>
    )
  } else {
    return <label {...props}>{file.path}</label>
  }
}
