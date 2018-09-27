import { expect } from 'chai'

import {
  groupRepositories,
  YourRepositoriesIdentifier,
} from '../../src/ui/clone-repository/group-repositories'
import { IAPIRepository, IAPIUser } from '../../src/lib/api'

const users = {
  shiftkey: {
    id: 1,
    url: '',
    login: 'shiftkey',
    avatar_url: '',
    name: 'Brendan Forster',
    type: 'User',
  } as IAPIUser,
  desktop: {
    id: 2,
    url: '',
    login: 'desktop',
    avatar_url: '',
    name: 'Desktop',
    type: 'Organization',
  } as IAPIUser,
  octokit: {
    id: 3,
    url: '',
    login: 'octokit',
    avatar_url: '',
    name: 'Octokit',
    type: 'Organization',
  } as IAPIUser,
}

describe('clone repository grouping', () => {
  it('groups repositories by organization', () => {
    const repositories: Array<IAPIRepository> = [
      {
        clone_url: '',
        ssh_url: '',
        html_url: '',
        name: 'some-repo',
        owner: users.shiftkey,
        private: true,
        fork: true,
        default_branch: '',
        parent: null,
        pushed_at: '1995-12-17T03:24:00',
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
        parent: null,
        pushed_at: '1995-12-17T03:24:00',
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
        parent: null,
        pushed_at: '1995-12-17T03:24:00',
      },
    ]

    const grouped = groupRepositories(repositories, 'shiftkey')
    expect(grouped.length).to.equal(3)

    expect(grouped[0].identifier).to.equal(YourRepositoriesIdentifier)
    expect(grouped[0].items.length).to.equal(1)

    let item = grouped[0].items[0]
    expect(item.name).to.equal('some-repo')

    expect(grouped[1].identifier).to.equal('desktop')
    expect(grouped[1].items.length).to.equal(1)

    item = grouped[1].items[0]
    expect(item.name).to.equal('desktop')

    item = grouped[2].items[0]
    expect(grouped[2].identifier).to.equal('octokit')
    expect(grouped[2].items.length).to.equal(1)

    item = grouped[2].items[0]
    expect(item.name).to.equal('octokit.net')
  })
})
