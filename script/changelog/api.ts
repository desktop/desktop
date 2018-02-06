const octokit = require('@octokit/rest')({
  timeout: 0,
  requestMedia: 'application/vnd.github.v3+json',
  headers: {
    'User-Agent': 'what-the-changelog',
  },
})

export interface IAPIPR {
  readonly title: string
  readonly body: string
}

export async function fetchPR(id: number): Promise<IAPIPR | null> {
  octokit.authenticate({
    type: 'token',
    token: process.env.GITHUB_ACCESS_TOKEN,
  })

  try {
    const response = await octokit.pullRequests.get({
      owner: 'desktop',
      repo: 'desktop',
      number: id,
    })
    const data = response.data
    return {
      title: data.title,
      body: data.body,
    }
  } catch (err) {
    console.error('API lookup failed', err)
    return null
  }
}
