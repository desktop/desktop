import * as HTTPS from 'https'

export interface IAPIPR {
  readonly title: string
  readonly body: string
}

type IAPIPullRequest = {
  readonly title: string
  readonly body: string
}

export function fetchPR(id: number): Promise<IAPIPR | null> {
  return new Promise((resolve, reject) => {
    const options: HTTPS.RequestOptions = {
      host: 'api.github.com',
      protocol: 'https:',
      path: `/repos/desktop/desktop/pulls/${id}`,
      method: 'GET',
      headers: {
        Authorization: `Token ${process.env.GITHUB_ACCESS_TOKEN}`,
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
          const json: IAPIPullRequest = JSON.parse(received)
          resolve(json)
        } catch (e) {
          console.error('API lookup failed', e)
          resolve(null)
        }
      })
    })

    request.end()
  })
}
