const octokit = require('@octokit/rest')({
  timeout: 0,
  requestMedia: 'application/vnd.github.v3+json',
  headers: {
    'User-Agent': 'what-the-changelog',
  },
})

octokit.authenticate({
  type: 'token',
  token: process.env.GITHUB_ACCESS_TOKEN,
})

export interface IDesktopPullRequest {
  readonly title: string
  readonly body: string
  readonly collaborators: ReadonlySet<string>
  readonly commits: ReadonlyArray<string>
}

interface IAPIUser {
  readonly login: string
}

interface IAPIPullRequest {
  readonly title: string
  readonly body: string
  readonly user: IAPIUser
}

interface IAPICommit {
  readonly sha: string
  readonly author?: IAPIUser
  readonly committer?: IAPIUser
}

interface IAPITeam {
  readonly name: string
  readonly id: number
}

interface IAPITeamMember {
  readonly login: string
}

// this account is assigned by GitHub as the committer for merged pull requests
// and should be excluded from being considered an external contributor
const webflowAccount = ['web-flow']

export async function getCoreTeamMembers(): Promise<ReadonlySet<string>> {
  try {
    let response = await octokit.orgs.getTeams({
      org: 'desktop',
      per_page: 100,
    })
    const teams: ReadonlyArray<IAPITeam> = response.data
    const coreTeam = teams.find(t => t.name === 'Core') || null

    if (coreTeam == null) {
      console.error('Unable to find core team on API')
      return new Set<string>()
    }

    const id = coreTeam.id

    response = await octokit.orgs.getTeamMembers({
      id,
      role: 'all',
      per_page: 100,
    })
    const members: ReadonlyArray<IAPITeamMember> = response.data

    return new Set(members.map(m => m.login).concat(webflowAccount))
  } catch (err) {
    console.error('API lookup failed for getCoreTeamMembers', err)
    return new Set<string>()
  }
}

export async function fetchPR(id: number): Promise<IDesktopPullRequest | null> {
  try {
    const pullRequestResponse = await octokit.pullRequests.get({
      owner: 'desktop',
      repo: 'desktop',
      number: id,
    })
    const { title, body } = pullRequestResponse.data as IAPIPullRequest

    let commitsResponse = await octokit.pullRequests.getCommits({
      owner: 'desktop',
      repo: 'desktop',
      number: id,
      per_page: 100,
    })

    let data: Array<IAPICommit> = commitsResponse.data
    while (octokit.hasNextPage(commitsResponse)) {
      commitsResponse = await octokit.getNextPage(commitsResponse)
      data = data.concat(commitsResponse.data)
    }

    const collaborators = new Set<string>()
    const commits = new Array<string>()

    for (const commit of data) {
      const { sha, author, committer } = commit

      commits.push(sha)
      if (author != null && !collaborators.has(author.login)) {
        collaborators.add(author.login)
      }
      if (committer != null && !collaborators.has(committer.login)) {
        collaborators.add(committer.login)
      }
    }

    return {
      title: title,
      body: body,
      collaborators,
      commits,
    }
  } catch (err) {
    console.error('API lookup failed for fetchPR', err)
    return null
  }
}
