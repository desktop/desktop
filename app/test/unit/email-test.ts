import {
  lookupPreferredEmail,
  getAttributableEmailsFor,
} from '../../src/lib/email'
import {
  IAPIEmail,
  getDotComAPIEndpoint,
  getEnterpriseAPIURL,
} from '../../src/lib/api'
import { Account } from '../../src/models/account'

describe('emails', () => {
  describe('lookupPreferredEmail', () => {
    it('returns a stealth email address for empty list', () => {
      const account = new Account(
        'shiftkey',
        getDotComAPIEndpoint(),
        '',
        [],
        '',
        1234,
        'Caps Lock'
      )

      expect(lookupPreferredEmail(account)).toBe(
        '1234+shiftkey@users.noreply.github.com'
      )
    })

    it('returns a stealth email address for empty list from GHES', () => {
      const account = new Account(
        'shiftkey',
        'https://github.example.com/api/v3',
        '',
        [],
        '',
        1234,
        'Caps Lock'
      )

      expect(lookupPreferredEmail(account)).toBe(
        '1234+shiftkey@users.noreply.github.example.com'
      )
    })

    it('returns the primary if it has public visibility', () => {
      const emails: IAPIEmail[] = [
        {
          email: 'shiftkey@example.com',
          primary: false,
          verified: true,
          visibility: null,
        },
        {
          email: 'shiftkey@users.noreply.github.com',
          primary: false,
          verified: true,
          visibility: null,
        },
        {
          email: 'my-primary-email@example.com',
          primary: true,
          verified: true,
          visibility: 'public',
        },
      ]

      const account = new Account(
        'shiftkey',
        getDotComAPIEndpoint(),
        '',
        emails,
        '',
        -1,
        'Caps Lock'
      )

      expect(lookupPreferredEmail(account)).toBe('my-primary-email@example.com')
    })

    it('returns the primary if it has null visibility', () => {
      const emails: IAPIEmail[] = [
        {
          email: 'shiftkey@example.com',
          primary: false,
          verified: true,
          visibility: null,
        },
        {
          email: 'shiftkey@users.noreply.github.com',
          primary: false,
          verified: true,
          visibility: null,
        },
        {
          email: 'my-primary-email@example.com',
          primary: true,
          verified: true,
          visibility: null,
        },
      ]

      const account = new Account(
        'shiftkey',
        getDotComAPIEndpoint(),
        '',
        emails,
        '',
        -1,
        'Caps Lock'
      )

      expect(lookupPreferredEmail(account)).toBe('my-primary-email@example.com')
    })

    it('returns the noreply if there is no public address', () => {
      const emails: IAPIEmail[] = [
        {
          email: 'shiftkey@example.com',
          primary: false,
          verified: true,
          visibility: null,
        },
        {
          email: 'shiftkey@users.noreply.github.com',
          primary: false,
          verified: true,
          visibility: null,
        },
        {
          email: 'my-primary-email@example.com',
          primary: true,
          verified: true,
          visibility: 'private',
        },
      ]

      const account = new Account(
        'shiftkey',
        getDotComAPIEndpoint(),
        '',
        emails,
        '',
        -1,
        'Caps Lock'
      )

      expect(lookupPreferredEmail(account)).toBe(
        'shiftkey@users.noreply.github.com'
      )
    })

    it('returns the noreply if there is no public address for GitHub Enterprise as well', () => {
      const emails: IAPIEmail[] = [
        {
          email: 'shiftkey@example.com',
          primary: false,
          verified: true,
          visibility: null,
        },
        {
          email: 'shiftkey@users.noreply.github.example.com',
          primary: false,
          verified: true,
          visibility: null,
        },
        {
          email: 'my-primary-email@example.com',
          primary: true,
          verified: true,
          visibility: 'private',
        },
      ]

      const account = new Account(
        'shiftkey',
        getEnterpriseAPIURL('https://github.example.com'),
        '',
        emails,
        '',
        -1,
        'Caps Lock'
      )

      expect(lookupPreferredEmail(account)).toBe(
        'shiftkey@users.noreply.github.example.com'
      )
    })

    it('uses first email if nothing special found', () => {
      const emails: IAPIEmail[] = [
        {
          email: 'shiftkey@example.com',
          primary: false,
          verified: true,
          visibility: null,
        },
        {
          email: 'github-primary@example.com',
          primary: false,
          verified: true,
          visibility: null,
        },
      ]

      const account = new Account(
        'shiftkey',
        getDotComAPIEndpoint(),
        '',
        emails,
        '',
        -1,
        'Caps Lock'
      )

      expect(lookupPreferredEmail(account)).toBe('shiftkey@example.com')
    })
  })

  describe('getAttributableEmailsFor', () => {
    it('returns all email addresses on the account as well as legacy and modern stealth emails', () => {
      const emails: IAPIEmail[] = [
        {
          email: 'personal@gmail.com',
          primary: true,
          verified: true,
          visibility: 'public',
        },
        {
          email: 'company@github.com',
          primary: false,
          verified: true,
          visibility: null,
        },
        {
          email: 'niik@users.noreply.github.com',
          primary: false,
          verified: true,
          visibility: null,
        },
      ]

      const endpoint = getDotComAPIEndpoint()
      const account = new Account('niik', endpoint, '', emails, '', 123, '')
      const attributable = getAttributableEmailsFor(account)

      expect(attributable).toEqual([
        'personal@gmail.com',
        'company@github.com',
        'niik@users.noreply.github.com',
        '123+niik@users.noreply.github.com',
      ])
    })

    it('returns stealth emails when account has no emails', () => {
      const endpoint = getDotComAPIEndpoint()
      const account = new Account('niik', endpoint, '', [], '', 123, '')
      const attributable = getAttributableEmailsFor(account)

      expect(attributable).toEqual([
        'niik@users.noreply.github.com',
        '123+niik@users.noreply.github.com',
      ])
    })

    it('returns stealth emails for GitHub Enterprise', () => {
      const endpoint = `https://github.example.com/api/v3`
      const account = new Account('niik', endpoint, '', [], '', 123, '')
      const attributable = getAttributableEmailsFor(account)

      expect(attributable).toEqual([
        'niik@users.noreply.github.example.com',
        '123+niik@users.noreply.github.example.com',
      ])
    })

    it('returns unique emails', () => {
      const emails: IAPIEmail[] = [
        {
          email: 'niik@users.noreply.github.com',
          primary: false,
          verified: true,
          visibility: null,
        },
        {
          email: '123+niik@users.noreply.github.com',
          primary: false,
          verified: true,
          visibility: null,
        },
      ]

      const endpoint = getDotComAPIEndpoint()
      const account = new Account('niik', endpoint, '', emails, '', 123, '')
      const attributable = getAttributableEmailsFor(account)

      expect(attributable).toEqual([
        'niik@users.noreply.github.com',
        '123+niik@users.noreply.github.com',
      ])
    })
  })
})
