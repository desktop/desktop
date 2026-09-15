import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  groupRepositories,
  YourRepositoriesIdentifier,
} from '../../src/ui/clone-repository/group-repositories'
import { IAPIIdentity, IAPIFullRepository } from '../../src/lib/api'

const users = {
  shiftkey: {
    id: 1,
    html_url: '',
    login: 'shiftkey',
    avatar_url: '',
    name: 'Brendan Forster',
    type: 'User',
  } as IAPIIdentity,
  desktop: {
    id: 2,
    html_url: '',
    login: 'desktop',
    avatar_url: '',
    name: 'Desktop',
    type: 'Organization',
  } as IAPIIdentity,
  octokit: {
    id: 3,
    html_url: '',
    login: 'octokit',
    avatar_url: '',
    name: 'Octokit',
    type: 'Organization',
  } as IAPIIdentity,
}

describe('clone repository grouping', () => {
  it('groups repositories by owner', () => {
    const repositories: Array<IAPIFullRepository> = [
      {
        clone_url: '',
        ssh_url: '',
        html_url: '',
        name: 'some-repo',
        owner: users.shiftkey,
        private: true,
        fork: true,
        default_branch: '',
        pushed_at: '1995-12-17T03:24:00',
        has_issues: true,
        archived: false,
        permissions: {
          pull: true,
          push: true,
          admin: false,
        },
        parent: undefined,
      },
      {
        clone_url: '',
        ssh_url: '',
        html_url: '',
        name: 'octokit.net',
        owner: users.octokit,
        private: false,
        fork: false,
        default_branch: '',
        pushed_at: '1995-12-17T03:24:00',
        has_issues: true,
        archived: false,
        permissions: {
          pull: true,
          push: true,
          admin: false,
        },
        parent: undefined,
      },
      {
        clone_url: '',
        ssh_url: '',
        html_url: '',
        name: 'desktop',
        owner: users.desktop,
        private: true,
        fork: false,
        default_branch: '',
        pushed_at: '1995-12-17T03:24:00',
        has_issues: true,
        archived: false,
        permissions: {
          pull: true,
          push: true,
          admin: false,
        },
        parent: undefined,
      },
    ]

    const grouped = groupRepositories(repositories, 'shiftkey')
    assert.equal(grouped.length, 3)

    assert.equal(grouped[0].identifier, YourRepositoriesIdentifier)
    assert.equal(grouped[0].items.length, 1)

    let item = grouped[0].items[0]
    assert.equal(item.name, 'some-repo')

    assert.equal(grouped[1].identifier, 'desktop')
    assert.equal(grouped[1].items.length, 1)

    item = grouped[1].items[0]
    assert.equal(item.name, 'desktop')

    item = grouped[2].items[0]
    assert.equal(grouped[2].identifier, 'octokit')
    assert.equal(grouped[2].items.length, 1)

    item = grouped[2].items[0]
    assert.equal(item.name, 'octokit.net')
  })
})
