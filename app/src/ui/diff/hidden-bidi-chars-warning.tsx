import React from 'react'
import { Octicon } from '../octicons'
import * as OcticonSymbol from '../octicons/octicons.generated'
import { LinkButton } from '../lib/link-button'

export class HiddenBidiCharsWarning extends React.Component {
  public render() {
    return (
      <div className="hidden-bidi-chars-warning">
        <Octicon symbol={OcticonSymbol.alert} />
        This diff contains bidirectional Unicode text that may be interpreted or
        compiled differently than what appears below. To review, open the file
        in an editor that reveals hidden Unicode characters.{' '}
        <LinkButton uri="https://github.co/hiddenchars">
          Learn more about bidirectional Unicode characters
        </LinkButton>
      </div>
    )
  }
}
