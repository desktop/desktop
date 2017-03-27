import * as chai from 'chai'
const expect = chai.expect

import { filterAndSort, resolveEmail } from '../../src/lib/email'
import { IAPIEmail } from '../../src/lib/api'

describe('email', () => {
  describe('filterAndSort', () => {
    it('hides private emails even for primary address', () => {
      const emails: IAPIEmail[] = [
        {
          email: 'second@somewhere.com',
          primary: false,
          verified: true,
          visibility: null,
        },
        {
          email: 'primary@somewhere.com',
          primary: true,
          verified: true,
          visibility: 'private',
        },
       ]

       const result = filterAndSort(emails)
       expect(result.length).to.equal(1)
       expect(result[0].email).to.equal('second@somewhere.com')
    })

    it('displays primary first, ignoring sort order', () => {
      const emails: IAPIEmail[] = [
        {
          email: 'primary@somewhere.com',
          primary: true,
          verified: true,
          visibility: null,
        },
        {
          email: 'first@somewhere.com',
          primary: false,
          verified: true,
          visibility: null,
        },
       ]

       const result = filterAndSort(emails)
       expect(result[0].email).to.equal('primary@somewhere.com')
       expect(result[1].email).to.equal('first@somewhere.com')
    })

    it('sorts alphabetically after primary email', () => {
      const emails: IAPIEmail[] = [
        {
          email: 'second@somewhere.com',
          primary: false,
          verified: true,
          visibility: null,
        },
        {
          email: 'first@somewhere.com',
          primary: false,
          verified: true,
          visibility: null,
        },
        {
          email: 'primary@somewhere.com',
          primary: true,
          verified: true,
          visibility: null,
        },
       ]

       const result = filterAndSort(emails)
       expect(result[0].email).to.equal('primary@somewhere.com')
       expect(result[1].email).to.equal('first@somewhere.com')
       expect(result[2].email).to.equal('second@somewhere.com')
    })

    it('sorts alphabetically when no primary email set', () => {
      const emails: IAPIEmail[] = [
        {
          email: 'second@somewhere.com',
          primary: false,
          verified: true,
          visibility: null,
        },
        {
          email: 'first@somewhere.com',
          primary: false,
          verified: true,
          visibility: null,
        },
        {
          email: 'third@somewhere.com',
          primary: false,
          verified: true,
          visibility: null,
        },
       ]

       const result = filterAndSort(emails)
       expect(result[0].email).to.equal('first@somewhere.com')
       expect(result[1].email).to.equal('second@somewhere.com')
       expect(result[2].email).to.equal('third@somewhere.com')
    })
  })

  describe('resolveEmail', () => {
    it('returns null for empty array', () => {
      expect(resolveEmail([])).to.be.null
    })

    it('returns noreply email if found', () => {
      const emails = [
        'second@somewhere.com',
        'my-cool-name@users.noreply.github.com',
      ]
      expect(resolveEmail(emails)).to.equal('my-cool-name@users.noreply.github.com')
    })

    it('returns first value otherwise', () => {
      const emails = [
        'second@somewhere.com',
        'first@somewhere.com',
      ]
      expect(resolveEmail(emails)).to.equal('second@somewhere.com')
    })
  })
})
