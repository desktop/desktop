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
  readonly collaborators: ReadonlyArray<string>
  readonly commits: ReadonlyArray<string>
}

interface IAPIPullRequest {
  readonly title: string
  readonly body: string
  readonly user: {
    readonly login: string
  }
}

interface IAPICommit {
  readonly sha: string
  readonly author?: {
    readonly login: string
  }
  readonly committer?: {
    readonly login: string
  }
}

interface IAPITeam {
  readonly name: string
  readonly id: number
}

interface IAPITeamMember {
  readonly login: string
}

const webflowAccount = ['web-flow']

export async function getCoreTeamMembers(): Promise<ReadonlyArray<string>> {
  try {
    let response = await octokit.orgs.getTeams({
      org: 'desktop',
      per_page: 100,
    })
    const teams: ReadonlyArray<IAPITeam> = response.data
    const coreTeam = teams.find(t => t.name === 'Core') || null

    if (coreTeam == null) {
      console.error('Unable to find core team on API')
      return []
    }

    const id = coreTeam.id

    response = await octokit.orgs.getTeamMembers({
      id,
      role: 'all',
      per_page: 100,
    })
    const members: ReadonlyArray<IAPITeamMember> = response.data

    return members.map(m => m.login).concat(webflowAccount)
  } catch (err) {
    console.error('API lookup failed for getCoreTeamMembers', err)
    return []
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

    const collaborators: Array<string> = []
    const commits: Array<string> = []

    for (const commit of data) {
      commits.push(commit.sha)
      if (commit.author && collaborators.indexOf(commit.author.login) === -1) {
        collaborators.push(commit.author.login)
      }
      if (
        commit.committer &&
        collaborators.indexOf(commit.committer.login) === -1
      ) {
        collaborators.push(commit.committer.login)
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
