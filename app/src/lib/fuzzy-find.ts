import * as fuzzAldrin from 'fuzzaldrin-plus'

import { compareDescending } from './compare'

export const options: fuzzAldrin.IFilterOptions = {
  allowErrors: true,
  isPath: true,
  pathSeparator: '-',
}

export function score(
  str: string,
  query: string,
  maxScore: number = fuzzAldrin.score(query, query, undefined, options)
) {
  return fuzzAldrin.score(str, query, undefined, options) / maxScore
}

export interface IMatch<T> {
  /** `0 <= score <= 1` */
  score: number
  item: T
  matches: ReadonlyArray<number>
}

export function match<T, _K extends keyof T>(
  query: string,
  items: ReadonlyArray<T>,
  getKey: _K | ((item: T) => string)
): ReadonlyArray<IMatch<T>> {
  // matching `query` against itself is a perfect match.
  const maxScore = score(query, query, 1)
  return items
    .map((item): IMatch<T> => {
      let key: string
      if (typeof getKey === 'function') {
        key = getKey(item)
      } else {
        key = String(item[getKey])
      }
      return {
        score: score(key, query, maxScore),
        item,
        matches: fuzzAldrin.match(key, query, undefined, options),
      }
    })
    .filter(({ matches }) => matches.length > 0)
    .sort(({ score: left }, { score: right }) => compareDescending(left, right))
}
