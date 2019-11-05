import { getNextPagePathWithIncreasingPageSize } from '../../src/lib/api'
import * as URL from 'url'

interface IPageInfo {
  per_page: number
  page: number
}

function createHeadersWithNextLink(url: string) {
  return new Headers({
    Link: `<${url}>; rel="next"`,
  })
}

function assertNext(current: IPageInfo, expected: IPageInfo) {
  const headers = createHeadersWithNextLink(
    `/items?per_page=${current.per_page}&page=${current.page}`
  )

  const nextPath = getNextPagePathWithIncreasingPageSize(
    new Response(null, { headers })
  )

  expect(nextPath).not.toBeNull()
  const { pathname, query } = URL.parse(nextPath!, true)

  expect(pathname).toBe('/items')

  const per_page = parseInt(
    typeof query.per_page === 'string' ? query.per_page : '',
    10
  )
  const page = parseInt(typeof query.page === 'string' ? query.page : '', 10)

  expect(per_page).toBe(expected.per_page)
  expect(page).toBe(expected.page)

  // If getNextPagePathWithIncreasingPageSize has fiddled with the
  // page size or page number we want to ensure that the next page will
  // get us more items than what we've gotten thus far.
  if (current.per_page !== per_page || current.page !== page) {
    const receivedCurrent = current.per_page * current.page
    const receivedNext = per_page * page

    expect(receivedNext).toBeGreaterThan(receivedCurrent)
  }
}

describe('API', () => {
  describe('getNextPagePathWithIncreasingPageSize', () => {
    it("returns null when there's no link header", () => {
      expect(getNextPagePathWithIncreasingPageSize(new Response())).toBeNull()
    })

    it('returns raw link when missing page size', () => {
      const nextPath = getNextPagePathWithIncreasingPageSize(
        new Response(null, {
          headers: createHeadersWithNextLink('/items?page=2'),
        })
      )

      expect(nextPath).toEqual('/items?page=2')
    })

    it('returns raw link when missing page number', () => {
      const nextPath = getNextPagePathWithIncreasingPageSize(
        new Response(null, {
          headers: createHeadersWithNextLink('/items?per_page=10'),
        })
      )

      expect(nextPath).toEqual('/items?per_page=10')
    })

    it('does not increase page size when not aligned', () => {
      const nextPath = getNextPagePathWithIncreasingPageSize(
        new Response(null, {
          headers: createHeadersWithNextLink('/items?per_page=10&page=2'),
        })
      )

      expect(nextPath).toEqual('/items?per_page=10&page=2')
    })

    it('increases page size on alignment with an initial page size of 10', () => {
      assertNext({ per_page: 10, page: 2 }, { per_page: 10, page: 2 })
      assertNext({ per_page: 10, page: 3 }, { per_page: 20, page: 2 })
      assertNext({ per_page: 20, page: 2 }, { per_page: 20, page: 2 })
      assertNext({ per_page: 20, page: 3 }, { per_page: 40, page: 2 })
      assertNext({ per_page: 40, page: 2 }, { per_page: 40, page: 2 })
      assertNext({ per_page: 40, page: 3 }, { per_page: 80, page: 2 })
      assertNext({ per_page: 80, page: 3 }, { per_page: 80, page: 3 })
      assertNext({ per_page: 80, page: 4 }, { per_page: 80, page: 4 })
      assertNext({ per_page: 80, page: 5 }, { per_page: 80, page: 5 })
      assertNext({ per_page: 80, page: 6 }, { per_page: 100, page: 5 })
    })

    it('increases page size on alignment with an initial page size of 5', () => {
      assertNext({ per_page: 5, page: 2 }, { per_page: 5, page: 2 })
      assertNext({ per_page: 5, page: 3 }, { per_page: 10, page: 2 })
    })

    it('increases page size on alignment with an initial page size of 1', () => {
      assertNext({ per_page: 1, page: 2 }, { per_page: 1, page: 2 })
      assertNext({ per_page: 1, page: 3 }, { per_page: 2, page: 2 })
      assertNext({ per_page: 2, page: 3 }, { per_page: 4, page: 2 })
      assertNext({ per_page: 4, page: 2 }, { per_page: 4, page: 2 })
      assertNext({ per_page: 4, page: 3 }, { per_page: 8, page: 2 })
      assertNext({ per_page: 8, page: 2 }, { per_page: 8, page: 2 })
      assertNext({ per_page: 8, page: 3 }, { per_page: 16, page: 2 })
      assertNext({ per_page: 16, page: 2 }, { per_page: 16, page: 2 })
      assertNext({ per_page: 16, page: 3 }, { per_page: 32, page: 2 })
      assertNext({ per_page: 32, page: 2 }, { per_page: 32, page: 2 })
      assertNext({ per_page: 32, page: 3 }, { per_page: 64, page: 2 })
    })

    it("doesn't increase page size when page size is 100", () => {
      assertNext({ per_page: 100, page: 2 }, { per_page: 100, page: 2 })
      assertNext({ per_page: 100, page: 3 }, { per_page: 100, page: 3 })
      assertNext({ per_page: 100, page: 4 }, { per_page: 100, page: 4 })
      assertNext({ per_page: 100, page: 5 }, { per_page: 100, page: 5 })
      assertNext({ per_page: 100, page: 6 }, { per_page: 100, page: 6 })
      assertNext({ per_page: 100, page: 7 }, { per_page: 100, page: 7 })
      assertNext({ per_page: 100, page: 8 }, { per_page: 100, page: 8 })
      assertNext({ per_page: 100, page: 9 }, { per_page: 100, page: 9 })
      assertNext({ per_page: 100, page: 10 }, { per_page: 100, page: 10 })
    })
  })
})
