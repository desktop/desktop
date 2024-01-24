import React from 'react'
import { Octicon } from '../octicons'
import * as OcticonSymbol from '../octicons/octicons.generated'
import { LinkButton } from '../lib/link-button'
import { LineEndingsChange } from '../../models/diff'

export enum DiffContentsWarningType {
  UnicodeBidiCharacters,
  LineEndingsChange,
}

type DiffContentsWarningProps =
  | {
      readonly type: DiffContentsWarningType.UnicodeBidiCharacters
    }
  | {
      readonly type: DiffContentsWarningType.LineEndingsChange
      readonly lineEndingsChange: LineEndingsChange
    }

export class DiffContentsWarning extends React.Component<DiffContentsWarningProps> {
  public render() {
    return (
      <div className="diff-contents-warning">
        <Octicon symbol={OcticonSymbol.alert} />
        {this.getWarningMessage()}
      </div>
    )
  }

  private getWarningMessage() {
    switch (this.props.type) {
      case DiffContentsWarningType.UnicodeBidiCharacters:
        return (
          <>
            This diff contains bidirectional Unicode text that may be
            interpreted or compiled differently than what appears below. To
            review, open the file in an editor that reveals hidden Unicode
            characters.{' '}
            <LinkButton uri="https://github.co/hiddenchars">
              Learn more about bidirectional Unicode characters
            </LinkButton>
          </>
        )

      case DiffContentsWarningType.LineEndingsChange:
        const { lineEndingsChange } = this.props
        return (
          <>
            This diff contains a change in line endings from '
            {lineEndingsChange.from}' to '{lineEndingsChange.to}'.
          </>
        )
    }
  }
}
