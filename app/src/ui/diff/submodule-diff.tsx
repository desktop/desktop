import * as React from 'react'

import { Octicon, OcticonSymbol } from '../octicons'
import { FileSummary, SubmoduleChangeType } from '../../models/diff'

interface ISubmoduleDiffProps {
  readonly changes: ReadonlyArray<FileSummary>
  readonly name: string
  readonly type: SubmoduleChangeType
  readonly sha?: string
}

/** A component to render when a new image has been added to the repository */
export class SubmoduleDiff extends React.Component<ISubmoduleDiffProps, void> {

  public render() {

    if (this.props.type === SubmoduleChangeType.Add || this.props.type === SubmoduleChangeType.Delete) {
      const action = this.props.type === SubmoduleChangeType.Add ? 'added' : 'removed'

      if (!this.props.sha) {
        console.error('the submodule diff should have specified a SHA but it didn\'t, look into this')
      }

      return <div className='panel' id='diff'>
        <div className='submodule-header'>
          <Octicon symbol={OcticonSymbol.fileSubmodule} /> Submodule {this.props.name} {action} at {this.props.sha}
        </div>
      </div>
    }

    const fileCountLabel = this.props.changes.length > 1 ? 'files' : 'file'

    return <div className='panel' id='diff'>
      <div className='submodule-header'>
        <Octicon symbol={OcticonSymbol.fileSubmodule} /> Submodule {this.props.name} updated {this.props.changes.length} {fileCountLabel}
      </div>

      <table className='submodule-changes'>
        <tbody>
      {this.props.changes.map(f =>
        <tr className='entry' key={f.id}>
          <td className='stats'>
            <span className='added'>+{f.added}</span>
            <span className='removed'> -{f.removed}</span>
          </td>
          <td className='icon'><Octicon symbol={OcticonSymbol.diffModified} /></td>
          <td className='path'>{f.path}</td>
        </tr>
      )}
        </tbody>
      </table>
    </div>
  }
}
