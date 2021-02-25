import {
  groupRepositories,
  YourRepositoriesIdentifier,
} from '../../src/ui/clone-repository/group-repositories'
import { IAPIIdentity, IAPIFullRepository } from '../../src/lib/api'

const users = {
  shiftkey: {
    id: 1,
    url: '',
    login: 'shiftkey',
    avatar_url: '',
    name: 'Brendan Forster',
    type: 'User',
  } as IAPIIdentity,
  desktop: {
    id: 2,
    url: '',
    login: 'desktop',
    avatar_url: '',
    name: 'Desktop',
    type: 'Organization',
  } as IAPIIdentity,
  octokit: {
    id: 3,
    url: '',
    login: 'octokit',
    avatar_url: '',
    name: 'Octokit',
    type: 'Organization',
  } as IAPIIdentity,
}

describe('clone repository grouping', () => {
  it('groups repositories by organization', () => {
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
    expect(grouped).toHaveLength(3)

    expect(grouped[0].identifier).toBe(YourRepositoriesIdentifier)
    expect(grouped[0].items).toHaveLength(1)

    let item = grouped[0].items[0]
    expect(item.name).toBe('some-repo')

    expect(grouped[1].identifier).toBe('desktop')
    expect(grouped[1].items).toHaveLength(1)

    item = grouped[1].items[0]
    expect(item.name).toBe('desktop')

    item = grouped[2].items[0]
    expect(grouped[2].identifier).toBe('octokit')
    expect(grouped[2].items).toHaveLength(1)

    item = grouped[2].items[0]
    expect(item.name).toBe('octokit.net')
  })
})
