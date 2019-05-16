import { getNextPagePathWithIncreasingPageSize } from '../../src/lib/api'

function createHeadersWithNextLink(url: string) {
  return new Headers({
    Link: `<${url}>; rel="next"`,
  })
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
  })
})
