import * as fuzzAldrin from 'fuzzaldrin-plus'

import { compareDescending } from './compare'

function score(str: string, query: string, maxScore: number) {
  return fuzzAldrin.score(str, query) / maxScore
}

export interface IMatches {
  readonly title: ReadonlyArray<number>
  readonly subtitle: ReadonlyArray<number>
}

export interface IMatch<T> {
  /** `0 <= score <= 1` */
  score: number
  item: T
  matches: IMatches
}

export type KeyFunction<T> = (item: T) => ReadonlyArray<string>

export function match<T, _K extends keyof T>(
  query: string,
  items: ReadonlyArray<T>,
  getKey: KeyFunction<T>
): ReadonlyArray<IMatch<T>> {
  // matching `query` against itself is a perfect match.
  const maxScore = score(query, query, 1)
  const result = items
    .map(
      (item): IMatch<T> => {
        const matches: Array<ReadonlyArray<number>> = []
        const itemTextArray = getKey(item)
        itemTextArray.forEach(text => {
          matches.push(fuzzAldrin.match(text, query))
        })

        return {
          score: score(itemTextArray.join(''), query, maxScore),
          item,
          matches: {
            title: matches[0],
            subtitle: matches.length > 1 ? matches[1] : [],
          },
        }
      }
    )
    .filter(
      ({ matches }) => matches.title.length > 0 || matches.subtitle.length > 0
    )
    .sort(({ score: left }, { score: right }) => compareDescending(left, right))

  return result
}
