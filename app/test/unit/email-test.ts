import { expect } from 'chai'

import { IEmail } from '../../src/models/email'
import { lookupEmail } from '../../src/lib/email'

describe('emails', () => {
  it('returns null for empty list', () => {
    expect(lookupEmail([])).to.equal(null)
  })

  it('ignores private emails', () => {
    const emails: IEmail[] = [
      {
        email: 'my-private-email@example.com',
        primary: true,
        verified: true,
        visibility: 'private',
      },
    ]
    expect(lookupEmail(emails)).to.equal(null)
  })

  it('uses noreply emails if found', () => {
    const emails: IEmail[] = [
      {
        email: 'shiftkey@example.com',
        primary: false,
        verified: true,
        visibility: 'public',
      },
      {
        email: 'shiftkey@users.noreply.github.com',
        primary: false,
        verified: true,
        visibility: 'public',
      },
      {
        email: 'my-private-email@example.com',
        primary: true,
        verified: true,
        visibility: 'private',
      },
    ]

    const result = lookupEmail(emails)
    expect(result).to.not.equal(null)
    expect(result!.email).to.equal('shiftkey@users.noreply.github.com')
  })

  it('uses primary if found', () => {
    const emails: IEmail[] = [
      {
        email: 'shiftkey@example.com',
        primary: false,
        verified: true,
        visibility: 'public',
      },
      {
        email: 'github-primary@example.com',
        primary: true,
        verified: true,
        visibility: 'public',
      },
    ]

    const result = lookupEmail(emails)
    expect(result).to.not.equal(null)
    expect(result!.email).to.equal('github-primary@example.com')
  })
})
