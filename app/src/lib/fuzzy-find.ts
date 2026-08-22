import * as fuzzAldrin from 'fuzzaldrin-plus'

import { compareDescending } from './compare'

/** Lets you search for more than one thing at a time, e.g. `foo|bar`. */
const QuerySeparator = '|'

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

function sortByScore<T>(matches: Array<IMatch<T>>): ReadonlyArray<IMatch<T>> {
  return matches.sort(({ score: left }, { score: right }) =>
    compareDescending(left, right)
  )
}

/** Matches a single query against the items. */
function matchQuery<T>(
  query: string,
  items: ReadonlyArray<T>,
  getKey: KeyFunction<T>
): Array<IMatch<T>> {
  // matching `query` against itself is a perfect match.
  const maxScore = score(query, query, 1)
  return items
    .map((item): IMatch<T> => {
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
    })
    .filter(
      ({ matches }) => matches.title.length > 0 || matches.subtitle.length > 0
    )
}

export function match<T>(
  query: string,
  items: ReadonlyArray<T>,
  getKey: KeyFunction<T>
): ReadonlyArray<IMatch<T>> {
  const queries = query
    .split(QuerySeparator)
    .map(q => q.trim())
    .filter(q => q.length > 0)

  // An item shows up once, scored by the query that fits it best.
  const best = new Map<T, IMatch<T>>()

  for (const q of queries) {
    for (const result of matchQuery(q, items, getKey)) {
      const existing = best.get(result.item)
      if (existing === undefined || result.score > existing.score) {
        best.set(result.item, result)
      }
    }
  }

  return sortByScore([...best.values()])
}
