import { getNextPagePathWithIncreasingPageSize } from '../../src/lib/api'

describe('API', () => {
  describe('getNextPagePathWithIncreasingPageSize', () => {
    it("returns null when there's no link header", () => {
      expect(getNextPagePathWithIncreasingPageSize(new Response())).toBeNull()
    })
  })
})
