import { describe, it, mock } from 'node:test'
import assert from 'node:assert'
import {
  getGiteaAPIEndpoint,
  getGiteaCompareURL,
  getGiteaHTMLURL,
  getPullRequestURL,
  giteaEndpointMatchesRemoteHost,
  isGiteaEndpoint,
  normalizeGiteaCombinedStatus,
  normalizeGiteaEmails,
  normalizeGiteaPullRequest,
  normalizeGiteaRepository,
} from '../../src/lib/gitea'
import {
  API,
  getHTMLURL,
  IAPIFullRepository,
  IAPIPullRequest,
} from '../../src/lib/api'
import { getAbsoluteUrl } from '../../src/lib/http'
import { matchGitHubRepository } from '../../src/lib/repository-matching'
import {
  Account,
  isEnterpriseAccount,
  isGiteaAccount,
} from '../../src/models/account'

const giteaAccount = (endpoint: string) =>
  new Account('alovelace', endpoint, 'token', [], '', 1, 'Ada')

const pullRequest = (
  props: Partial<IAPIPullRequest> = {}
): IAPIPullRequest => ({
  number: 1,
  title: 'Add a feature',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-02T00:00:00Z',
  user: {
    id: 1,
    login: 'alovelace',
    avatar_url: '',
    html_url: '',
    type: 'User',
  },
  head: { ref: 'feature', sha: 'abc', repo: null },
  base: { ref: 'main', sha: 'def', repo: null },
  body: 'body',
  state: 'open',
  ...props,
})

describe('gitea', () => {
  describe('isGiteaEndpoint', () => {
    it('detects Gitea API endpoints', () => {
      assert(isGiteaEndpoint('https://gitea.example.com/api/v1'))
      assert(isGiteaEndpoint('https://gitea.example.com/api/v1/'))
      assert(isGiteaEndpoint('http://localhost:3000/api/v1'))
      assert(isGiteaEndpoint('https://example.com/git/api/v1'))
    })

    it('does not detect GitHub endpoints', () => {
      assert(!isGiteaEndpoint('https://api.github.com'))
      assert(!isGiteaEndpoint('https://ghe.example.com/api/v3'))
      assert(!isGiteaEndpoint('https://api.example.ghe.com/'))
      assert(!isGiteaEndpoint('not a url'))
    })
  })

  describe('getGiteaAPIEndpoint', () => {
    it('defaults to https', () => {
      assert.equal(
        getGiteaAPIEndpoint('gitea.example.com'),
        'https://gitea.example.com/api/v1'
      )
    })

    it('retains protocol, port and sub path', () => {
      assert.equal(
        getGiteaAPIEndpoint('http://localhost:3000/'),
        'http://localhost:3000/api/v1'
      )
      assert.equal(
        getGiteaAPIEndpoint(' https://example.com/git/ '),
        'https://example.com/git/api/v1'
      )
    })

    it('accepts the API url itself', () => {
      assert.equal(
        getGiteaAPIEndpoint('https://gitea.example.com/api/v1/'),
        'https://gitea.example.com/api/v1'
      )
    })

    it('rejects invalid addresses', () => {
      assert.equal(getGiteaAPIEndpoint(''), null)
      assert.equal(getGiteaAPIEndpoint('ftp://gitea.example.com'), null)
      assert.equal(getGiteaAPIEndpoint('https://'), null)
    })
  })

  describe('getGiteaHTMLURL', () => {
    it('strips the API path but keeps port and sub path', () => {
      assert.equal(
        getGiteaHTMLURL('https://gitea.example.com:3000/git/api/v1'),
        'https://gitea.example.com:3000/git'
      )
      assert.equal(
        getHTMLURL('https://gitea.example.com/api/v1'),
        'https://gitea.example.com'
      )
    })
  })

  describe('giteaEndpointMatchesRemoteHost', () => {
    const endpoint = 'https://gitea.example.com:3000/git/api/v1'

    it('matches https remotes with port and sub path', () => {
      assert(
        giteaEndpointMatchesRemoteHost(endpoint, 'gitea.example.com:3000/git')
      )
    })

    it('matches ssh remotes', () => {
      assert(giteaEndpointMatchesRemoteHost(endpoint, 'gitea.example.com'))
      assert(giteaEndpointMatchesRemoteHost(endpoint, 'Gitea.Example.com:2222'))
    })

    it('does not match other hosts', () => {
      assert(!giteaEndpointMatchesRemoteHost(endpoint, 'github.com'))
      assert(
        !giteaEndpointMatchesRemoteHost(endpoint, 'gitea.example.com.evil.com')
      )
    })
  })

  describe('matchGitHubRepository', () => {
    it('matches Gitea remotes', () => {
      const accounts = [giteaAccount('http://localhost:3000/api/v1')]

      for (const remote of [
        'http://localhost:3000/owner/repo.git',
        'git@localhost:owner/repo.git',
        'ssh://git@localhost:2222/owner/repo.git',
      ]) {
        const match = matchGitHubRepository(accounts, remote)
        assert(match !== null, remote)
        assert.equal(match.owner, 'owner')
        assert.equal(match.name, 'repo')
        assert.equal(match.account, accounts[0])
      }
    })

    it('matches Gitea remotes hosted below a sub path', () => {
      const accounts = [giteaAccount('https://example.com/git/api/v1')]
      const match = matchGitHubRepository(
        accounts,
        'https://example.com/git/owner/repo.git'
      )
      assert(match !== null)
      assert.equal(match.owner, 'owner')
      assert.equal(match.name, 'repo')
    })

    it('does not match other hosts', () => {
      const accounts = [giteaAccount('https://gitea.example.com/api/v1')]
      const match = matchGitHubRepository(
        accounts,
        'https://github.com/owner/repo.git'
      )
      assert.equal(match, null)
    })
  })

  describe('accounts', () => {
    it('distinguishes Gitea accounts from Enterprise accounts', () => {
      const gitea = giteaAccount('https://gitea.example.com/api/v1')
      const ghes = giteaAccount('https://ghe.example.com/api/v3')

      assert(isGiteaAccount(gitea))
      assert(!isEnterpriseAccount(gitea))
      assert.equal(gitea.friendlyEndpoint, 'gitea.example.com')

      assert(!isGiteaAccount(ghes))
      assert(isEnterpriseAccount(ghes))
    })
  })

  describe('getPullRequestURL', () => {
    it('uses the Gitea pull request path', () => {
      assert.equal(
        getPullRequestURL(
          'https://gitea.example.com/owner/repo',
          'https://gitea.example.com/api/v1',
          12
        ),
        'https://gitea.example.com/owner/repo/pulls/12'
      )
    })

    it('uses the GitHub pull request path', () => {
      assert.equal(
        getPullRequestURL(
          'https://github.com/owner/repo',
          'https://api.github.com',
          12
        ),
        'https://github.com/owner/repo/pull/12'
      )
    })
  })

  describe('getGiteaCompareURL', () => {
    const repo = 'https://gitea.example.com/owner/repo'

    it('compares against the given base branch', () => {
      assert.equal(
        getGiteaCompareURL(repo, 'feature/my branch', 'main'),
        `${repo}/compare/main...feature/my%20branch`
      )
    })

    it('lets Gitea pick the default branch', () => {
      assert.equal(
        getGiteaCompareURL(repo, 'feature'),
        `${repo}/compare/feature`
      )
    })

    it('prefixes the head owner for forks', () => {
      assert.equal(
        getGiteaCompareURL(repo, 'feature', 'main', 'contributor'),
        `${repo}/compare/main...contributor:feature`
      )
    })
  })

  describe('normalizeGiteaPullRequest', () => {
    it('keeps the draft flag when reported', () => {
      assert.equal(normalizeGiteaPullRequest(pullRequest()).draft, false)
      assert.equal(
        normalizeGiteaPullRequest(pullRequest({ draft: true })).draft,
        true
      )
    })

    it('detects work in progress prefixes', () => {
      for (const title of ['WIP: thing', '[WIP] thing', 'wip: thing']) {
        const pr = normalizeGiteaPullRequest(
          pullRequest({ title, draft: undefined })
        )
        assert.equal(pr.draft, true, title)
      }

      const pr = normalizeGiteaPullRequest(
        pullRequest({ title: 'Wipe cache', draft: undefined })
      )
      assert.equal(pr.draft, false)
    })

    it('defaults a missing body to an empty string', () => {
      const raw = { ...pullRequest(), body: null } as unknown as IAPIPullRequest
      assert.equal(normalizeGiteaPullRequest(raw).body, '')
    })
  })

  describe('normalizeGiteaRepository', () => {
    const proxy = 'https://gitea-proxy.example.workers.dev/api/v1'
    const apiRepo = (owner: string, name: string) =>
      ({
        name,
        owner: { id: 1, login: owner },
        html_url: `https://internal.example.com/${owner}/${name}`,
        clone_url: `https://internal.example.com/${owner}/${name}.git`,
        ssh_url: `git@internal.example.com:${owner}/${name}.git`,
      } as unknown as IAPIFullRepository)

    it('points web and clone URLs at the registered server', () => {
      const repo = normalizeGiteaRepository(apiRepo('HAL', 'Project'), proxy)
      assert.equal(
        repo.html_url,
        'https://gitea-proxy.example.workers.dev/HAL/Project'
      )
      assert.equal(
        repo.clone_url,
        'https://gitea-proxy.example.workers.dev/HAL/Project.git'
      )
      assert.equal(repo.ssh_url, 'git@internal.example.com:HAL/Project.git')
    })

    it('normalizes the parent of forks', () => {
      const fork = {
        ...apiRepo('me', 'Project'),
        parent: apiRepo('HAL', 'Project'),
      }
      const repo = normalizeGiteaRepository(fork, proxy)
      assert.equal(
        repo.parent?.html_url,
        'https://gitea-proxy.example.workers.dev/HAL/Project'
      )
    })

    it('normalizes pull request repositories', () => {
      const pr = normalizeGiteaPullRequest(
        pullRequest({
          head: { ref: 'feature', sha: 'abc', repo: apiRepo('me', 'Project') },
          base: { ref: 'main', sha: 'def', repo: apiRepo('HAL', 'Project') },
        }),
        proxy
      )
      assert.equal(
        pr.base.repo?.html_url,
        'https://gitea-proxy.example.workers.dev/HAL/Project'
      )
      assert.equal(
        pr.head.repo?.clone_url,
        'https://gitea-proxy.example.workers.dev/me/Project.git'
      )
    })
  })

  describe('normalizeGiteaCombinedStatus', () => {
    it('maps Gitea statuses to GitHub statuses', () => {
      const status = normalizeGiteaCombinedStatus({
        state: 'warning',
        total_count: 3,
        statuses: [
          {
            id: 1,
            status: 'success',
            target_url: 'https://ci.example.com/1',
            description: 'Build passed',
            context: 'ci/build',
          },
          {
            id: 2,
            status: 'warning',
            target_url: null,
            description: 'Lint warnings',
            context: 'ci/lint',
          },
          {
            id: 3,
            status: 'pending',
            target_url: null,
            description: 'Waiting',
            context: 'ci/test',
          },
        ],
      })

      assert.equal(status.state, 'failure')
      assert.equal(status.total_count, 3)
      assert.deepEqual(
        status.statuses.map(s => [s.context, s.state]),
        [
          ['ci/build', 'success'],
          ['ci/lint', 'failure'],
          ['ci/test', 'pending'],
        ]
      )
      assert.equal(status.statuses[0].target_url, 'https://ci.example.com/1')
    })

    it('handles commits without statuses', () => {
      const status = normalizeGiteaCombinedStatus({
        state: '',
        total_count: 0,
        statuses: null,
      })

      assert.equal(status.state, 'pending')
      assert.equal(status.total_count, 0)
      assert.deepEqual(status.statuses, [])
    })
  })

  describe('normalizeGiteaEmails', () => {
    it('maps emails', () => {
      assert.deepEqual(
        normalizeGiteaEmails([
          { email: 'ada@example.com', verified: true, primary: true },
        ]),
        [
          {
            email: 'ada@example.com',
            verified: true,
            primary: true,
            visibility: null,
          },
        ]
      )
    })
  })

  describe('getAbsoluteUrl', () => {
    it('does not duplicate the API path of Gitea pagination links', () => {
      assert.equal(
        getAbsoluteUrl(
          'https://gitea.example.com/api/v1',
          '/api/v1/repos/owner/repo/pulls?state=open&limit=50&page=2'
        ),
        'https://gitea.example.com/api/v1/repos/owner/repo/pulls?state=open&limit=50&page=2'
      )
    })

    it('does not duplicate the API path of Gitea hosted below a sub path', () => {
      assert.equal(
        getAbsoluteUrl(
          'https://example.com/git/api/v1',
          '/git/api/v1/repos/owner/repo/pulls?page=2'
        ),
        'https://example.com/git/api/v1/repos/owner/repo/pulls?page=2'
      )
    })

    it('handles relative paths', () => {
      assert.equal(
        getAbsoluteUrl('https://gitea.example.com/api/v1', 'repos/o/r/pulls'),
        'https://gitea.example.com/api/v1/repos/o/r/pulls'
      )
    })
  })

  describe('API', () => {
    it('pages through and normalizes Gitea pull requests', async t => {
      const endpoint = 'https://gitea.example.com/api/v1'
      const requested = new Array<string>()

      const pages: ReadonlyArray<ReadonlyArray<IAPIPullRequest>> = [
        [pullRequest({ number: 1, title: 'WIP: first' })],
        [pullRequest({ number: 2, title: 'second', draft: false })],
      ]

      const fetchMock = mock.method(globalThis, 'fetch', async (input: any) => {
        const url = new URL(`${input}`)
        requested.push(`${url.pathname}${url.search}`)
        const page = parseInt(url.searchParams.get('page') ?? '1', 10)
        const headers = new Headers({ 'Content-Type': 'application/json' })

        if (page < pages.length) {
          const next = new URL(url)
          next.searchParams.set('page', `${page + 1}`)
          headers.set('Link', `<${next}>; rel="next"`)
        }

        return new Response(JSON.stringify(pages[page - 1]), {
          status: 200,
          headers,
        })
      })
      t.after(() => fetchMock.mock.restore())

      const prs = await new API(endpoint, 'token').fetchAllOpenPullRequests(
        'owner',
        'repo'
      )

      assert.deepEqual(
        prs.map(pr => [pr.number, pr.draft]),
        [
          [1, true],
          [2, false],
        ]
      )
      assert.deepEqual(requested, [
        '/api/v1/repos/owner/repo/pulls?state=open&limit=100',
        '/api/v1/repos/owner/repo/pulls?state=open&limit=100&page=2',
      ])
    })
  })
})
