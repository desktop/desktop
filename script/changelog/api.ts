import * as HTTPS from 'https'

export interface IAPIPR {
  readonly title: string
  readonly body: string
}

type GraphQLResponse = {
  readonly data: {
    readonly repository: {
      readonly pullRequest: IAPIPR
    }
  }
}

export function fetchPR(id: number): Promise<IAPIPR | null> {
  return new Promise((resolve, reject) => {
    const options: HTTPS.RequestOptions = {
      host: 'api.github.com',
      protocol: 'https:',
      path: '/graphql',
      method: 'POST',
      headers: {
        Authorization: `bearer ${process.env.GITHUB_ACCESS_TOKEN}`,
        'User-Agent': 'what-the-changelog',
      },
    }

    const request = HTTPS.request(options, response => {
      let received = ''
      response.on('data', chunk => {
        received += chunk
      })

      response.on('end', () => {
        try {
          const json: GraphQLResponse = JSON.parse(received)
          const pr = json.data.repository.pullRequest
          resolve(pr)
        } catch (e) {
          resolve(null)
        }
      })
    })

    const graphql = `
{
  repository(owner: "desktop", name: "desktop") {
    pullRequest(number: ${id}) {
      title
      body
    }
  }
}
`
    request.write(JSON.stringify({ query: graphql }))

    request.end()
  })
}
