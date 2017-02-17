import * as chai from 'chai'
const expect = chai.expect

import { matchGitHubRepository } from '../../src/lib/repository-matching'
import { User } from '../../src/models/user'

describe('Repository matching', () => {
  it('matches HTTPS URLs', () => {
    const users = [ new User('alovelace', 'https://api.github.com', '', new Array<string>(), '', 1, '') ]
    const repo = matchGitHubRepository(users, 'https://github.com/someuser/somerepo.git')!
    expect(repo.name).to.equal('somerepo')
    expect(repo.owner.login).to.equal('someuser')
  })

  it('matches HTTPS URLs without the git extension', () => {
    const users = [ new User('alovelace', 'https://api.github.com', '', new Array<string>(), '', 1, '') ]
    const repo = matchGitHubRepository(users, 'https://github.com/someuser/somerepo')!
    expect(repo.name).to.equal('somerepo')
    expect(repo.owner.login).to.equal('someuser')
  })

  it('matches git URLs', () => {
    const users = [ new User('alovelace', 'https://api.github.com', '', new Array<string>(), '', 1, '') ]
    const repo = matchGitHubRepository(users, 'git:github.com/someuser/somerepo.git')!
    expect(repo.name).to.equal('somerepo')
    expect(repo.owner.login).to.equal('someuser')
  })

  it('matches SSH URLs', () => {
    const users = [ new User('alovelace', 'https://api.github.com', '', new Array<string>(), '', 1, '') ]
    const repo = matchGitHubRepository(users, 'git@github.com:someuser/somerepo.git')!
    expect(repo.name).to.equal('somerepo')
    expect(repo.owner.login).to.equal('someuser')
  })

  it(`doesn't match if there aren't any users with that endpoint`, () => {
    const users = [ new User('alovelace', 'https://github.babbageinc.com', '', new Array<string>(), '', 1, '') ]
    const repo = matchGitHubRepository(users, 'https://github.com/someuser/somerepo.git')
    expect(repo).to.equal(null)
  })
})
