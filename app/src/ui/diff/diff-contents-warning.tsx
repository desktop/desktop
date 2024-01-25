import React from 'react'
import { Octicon } from '../octicons'
import * as OcticonSymbol from '../octicons/octicons.generated'
import { LinkButton } from '../lib/link-button'
import { ITextDiff, LineEndingsChange } from '../../models/diff'

export enum DiffContentsWarningType {
  UnicodeBidiCharacters,
  LineEndingsChange,
}

type DiffContentsWarningItem =
  | {
      readonly type: DiffContentsWarningType.UnicodeBidiCharacters
    }
  | {
      readonly type: DiffContentsWarningType.LineEndingsChange
      readonly lineEndingsChange: LineEndingsChange
    }

export function getTextDiffWarningItems(
  diff: ITextDiff
): ReadonlyArray<DiffContentsWarningItem> {
  const items = new Array<DiffContentsWarningItem>()

  if (diff.hasHiddenBidiChars) {
    items.push({
      type: DiffContentsWarningType.UnicodeBidiCharacters,
    })
  }

  if (diff.lineEndingsChange) {
    items.push({
      type: DiffContentsWarningType.LineEndingsChange,
      lineEndingsChange: diff.lineEndingsChange,
    })
  }

  return items
}

interface IDiffContentsWarningProps {
  readonly items: ReadonlyArray<DiffContentsWarningItem>
}

export class DiffContentsWarning extends React.Component<IDiffContentsWarningProps> {
  public render() {
    return (
      <div className="diff-contents-warning-container">
        {this.props.items.map((item, i) => (
          <div className="diff-contents-warning" key={i}>
            <Octicon symbol={OcticonSymbol.alert} />
            {this.getWarningMessageForItem(item)}
          </div>
        ))}
      </div>
    )
  }

  private getWarningMessageForItem(item: DiffContentsWarningItem) {
    switch (item.type) {
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
        const { lineEndingsChange } = item
        return (
          <>
            This diff contains a change in line endings from '
            {lineEndingsChange.from}' to '{lineEndingsChange.to}'.
          </>
        )
    }
  }
}
