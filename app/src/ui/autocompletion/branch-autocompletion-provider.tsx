import * as React from 'react'

import { IAutocompletionProvider } from './autocompletion-provider'
import { Branch } from '../../models/branch'

interface IBranchHit {
  readonly name: string
}

export class BranchAutocompletionProvider
  implements IAutocompletionProvider<IBranchHit> {
  public readonly kind = 'branch'
  private readonly branches: ReadonlyArray<Branch>

  public constructor(branches: ReadonlyArray<Branch>) {
    this.branches = branches
  }

  public getRegExp(): RegExp {
    return /(?:^|\n| )([a-z\d\\+-][a-z\d_-]*)?/g
  }

  public getAutocompletionItems(
    text: string
  ): Promise<ReadonlyArray<IBranchHit>> {
    const completionItems = this.branches
      .map(branch => {
        const hit: IBranchHit = { name: branch.name }

        return hit
      })
      .filter(hit => score(hit, text) > 0)

    return Promise.resolve(completionItems)
  }

  public renderItem(item: IBranchHit): JSX.Element {
    return (
      <div className="branch" key={item.name}>
        <span className="branch-name">{item.name}</span>
      </div>
    )
  }

  public getCompletionText(item: IBranchHit): string {
    return `${item.name}`
  }
}

function score(hit: IBranchHit, text: string): number {
  const maxScore = 1
  const name = hit.name.toLowerCase()
  const s = text.toLowerCase()

  if (name.startsWith(s)) {
    return maxScore
  }

  if (name.toLowerCase().includes(s)) {
    return maxScore - 0.1
  }

  return 0
}
