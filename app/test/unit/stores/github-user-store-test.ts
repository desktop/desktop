import { describe, it } from 'node:test'
import assert from 'node:assert'
import { matchMentionableUsers } from '../../../src/lib/stores/github-user-store'
import { IMentionableUser } from '../../../src/lib/databases/github-user-database'

const mona: IMentionableUser = {
  login: 'octocat',
  name: 'Mona Lisa',
  email: 'octocat@example.com',
  avatarURL: 'https://avatars.example.com/octocat',
}

// A user that hasn't configured a real name (name === null).
const namelessUser: IMentionableUser = {
  login: 'hubot',
  name: null,
  email: 'hubot@example.com',
  avatarURL: 'https://avatars.example.com/hubot',
}

const users: ReadonlyArray<IMentionableUser> = [mona, namelessUser]

describe('matchMentionableUsers', () => {
  it('does not match users without a name when searching for "null"', () => {
    // Before the fix, a `null` name was interpolated as the literal string
    // "null", causing nameless users to match the query "null".
    assert.deepStrictEqual(matchMentionableUsers(users, 'null'), [])
  })

  it('does not drag in a nameless user on a leading "n"', () => {
    const logins = matchMentionableUsers(users, 'n').map(u => u.login)

    // "octocat Mona Lisa" legitimately contains an "n" (Mona); the nameless
    // "hubot" must not be matched via the literal "null".
    assert.ok(!logins.includes('hubot'))
  })

  it('matches a user by their login even when they have no name', () => {
    const hits = matchMentionableUsers(users, 'hubot')

    assert.equal(hits.length, 1)
    assert.equal(hits[0].login, 'hubot')
  })

  it('matches a user by their real name', () => {
    const hits = matchMentionableUsers(users, 'mona')

    assert.equal(hits.length, 1)
    assert.equal(hits[0].login, 'octocat')
  })

  it('matches a user by their login', () => {
    const hits = matchMentionableUsers(users, 'octo')

    assert.equal(hits.length, 1)
    assert.equal(hits[0].login, 'octocat')
  })

  it('ranks earlier matches ahead of later ones', () => {
    const scarecrow: IMentionableUser = {
      login: 'scarecrow',
      name: null,
      email: 'scarecrow@example.com',
      avatarURL: 'https://avatars.example.com/scarecrow',
    }
    const oscar: IMentionableUser = {
      login: 'oscar',
      name: null,
      email: 'oscar@example.com',
      avatarURL: 'https://avatars.example.com/oscar',
    }

    // "scar" starts at index 0 of "scarecrow" but at index 1 of "oscar", so
    // scarecrow should rank first.
    const logins = matchMentionableUsers([oscar, scarecrow], 'scar').map(
      u => u.login
    )

    assert.deepStrictEqual(logins, ['scarecrow', 'oscar'])
  })

  it('honors the maxHits limit', () => {
    const many: ReadonlyArray<IMentionableUser> = Array.from(
      { length: 5 },
      (_, i) => ({
        login: `matcher${i}`,
        name: null,
        email: `matcher${i}@example.com`,
        avatarURL: `https://avatars.example.com/matcher${i}`,
      })
    )

    assert.equal(matchMentionableUsers(many, 'matcher', 3).length, 3)
  })

  it('ranks a login match ahead of a name-only match', () => {
    const loginMatch: IMentionableUser = {
      login: 'scarf',
      name: null,
      email: 'scarf@example.com',
      avatarURL: 'https://avatars.example.com/scarf',
    }
    const nameMatch: IMentionableUser = {
      login: 'zzz',
      name: 'Scar Face',
      email: 'zzz@example.com',
      avatarURL: 'https://avatars.example.com/zzz',
    }

    // "scar" matches at index 0 of login "scarf" but at index 4 of the haystack
    // "zzz scar face" (i.e. the "login " prefix is still part of the search
    // string), so the login match must rank first.
    const logins = matchMentionableUsers([nameMatch, loginMatch], 'scar').map(
      u => u.login
    )

    assert.deepStrictEqual(logins, ['scarf', 'zzz'])
  })

  it('treats an empty-string name the same as a null name', () => {
    const withEmptyName: IMentionableUser = {
      login: 'foo',
      name: '',
      email: 'foo@example.com',
      avatarURL: 'https://avatars.example.com/foo',
    }
    const withNullName: IMentionableUser = { ...withEmptyName, name: null }

    // Both forms match by login and neither one is dragged in by "null".
    assert.equal(matchMentionableUsers([withEmptyName], 'foo').length, 1)
    assert.equal(matchMentionableUsers([withNullName], 'foo').length, 1)
    assert.equal(matchMentionableUsers([withEmptyName], 'null').length, 0)
  })

  it('breaks ties alphabetically by login', () => {
    const teamZoo: IMentionableUser = {
      login: 'team-zoo',
      name: null,
      email: 'team-zoo@example.com',
      avatarURL: 'https://avatars.example.com/team-zoo',
    }
    const teamAnt: IMentionableUser = {
      login: 'team-ant',
      name: null,
      email: 'team-ant@example.com',
      avatarURL: 'https://avatars.example.com/team-ant',
    }

    // Both match "team" at index 0, so the secondary alphabetical-by-login
    // sort decides the order.
    const logins = matchMentionableUsers([teamZoo, teamAnt], 'team').map(
      u => u.login
    )

    assert.deepStrictEqual(logins, ['team-ant', 'team-zoo'])
  })

  it('matches case-insensitively for uppercase queries', () => {
    const hits = matchMentionableUsers(users, 'MONA')

    assert.equal(hits.length, 1)
    assert.equal(hits[0].login, 'octocat')
  })
})
