import * as fuzzAldrin from 'fuzzaldrin-plus'

import { compareDescending } from './compare'

const options: fuzzAldrin.IFilterOptions = {
  allowErrors: true,
  isPath: true,
  pathSeparator: '-',
}

function score(str: string, query: string, maxScore: number) {
  return fuzzAldrin.score(str, query, undefined, options) / maxScore
}

export interface IMatch<T> {
  /** `0 <= score <= 1` */
  score: number
  item: T
  matches: ReadonlyArray<number>
}

export type KeyFunction<T> = (item: T) => string

export function match<T, _K extends keyof T>(
  query: string,
  items: ReadonlyArray<T>,
  getKey: _K | KeyFunction<T>
): ReadonlyArray<IMatch<T>> {
  // matching `query` against itself is a perfect match.
  const maxScore = score(query, query, 1)
  const result = items
    .map((item): IMatch<T> => {
      const key: string =
        typeof getKey === 'function'
          ? (getKey as KeyFunction<T>)(item)
          : String(item[getKey])

      return {
        score: score(key, query, maxScore),
        item,
        matches: fuzzAldrin.match(key, query, undefined, options),
      }
    })
    .filter(({ matches }) => matches.length > 0)
    .sort(({ score: left }, { score: right }) => compareDescending(left, right))
  return result
}
