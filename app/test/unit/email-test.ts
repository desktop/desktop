import { lookupPreferredEmail } from '../../src/lib/email'
import { IAPIEmail } from '../../src/lib/api'

describe('emails', () => {
  it('returns null for empty list', () => {
    expect(lookupPreferredEmail([])).toBeNull()
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

    const result = lookupPreferredEmail(emails)
    expect(result).not.toBeNull()
    expect(result!.email).toBe('my-primary-email@example.com')
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

    const result = lookupPreferredEmail(emails)
    expect(result).not.toBeNull()
    expect(result!.email).toBe('my-primary-email@example.com')
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

    const result = lookupPreferredEmail(emails)
    expect(result).not.toBeNull()
    expect(result!.email).toBe('shiftkey@users.noreply.github.com')
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

    const result = lookupPreferredEmail(emails)
    expect(result).not.toBeNull()
    expect(result!.email).toBe('shiftkey@example.com')
  })
})
