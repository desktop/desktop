const octokit = require('@octokit/rest')({
  timeout: 0,
  requestMedia: 'application/vnd.github.v3+json',
  headers: {
    'User-Agent': 'what-the-changelog',
  },
})

export interface IDesktopPullRequest {
  readonly title: string
  readonly body: string
}

interface IAPIPullRequest {
  readonly title: string
  readonly body: string
  readonly user: {
    readonly login: string
  }
}

interface IAPICommit {
  commit: {
    message: string
  }
}

export async function fetchPR(id: number): Promise<IDesktopPullRequest | null> {
  octokit.authenticate({
    type: 'token',
    token: process.env.GITHUB_ACCESS_TOKEN,
  })

  try {
    const pullRequestResponse = await octokit.pullRequests.get({
      owner: 'desktop',
      repo: 'desktop',
      number: id,
    })
    const pullRequestData: IAPIPullRequest = pullRequestResponse.data

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

    return {
      title: pullRequestData.title,
      body: pullRequestData.body,
    }
  } catch (err) {
    console.error('API lookup failed', err)
    return null
  }
}
