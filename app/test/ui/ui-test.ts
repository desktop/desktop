import * as puppeteer from 'puppeteer'
import { promisify } from 'util'
import { startApp } from '../../../script/start-app'
import { ChildProcess } from 'child_process'

const url = `http://localhost:1234/json/version`

describe('ui', () => {
  let browser: puppeteer.Browser | null = null
  let endpoint: string | null = null
  let app: ChildProcess | null = null

  beforeAll(async () => {
    app = startApp() || null

    // Investigate using wait-port/wait-for-localhost or some other
    // method to ensure the server is running
    await promisify(setTimeout)(5000)

    console.log('Fetching wsl endpoint')
    try {
      const response = await fetch(url)
      console.log('Done fetching')

      const json = await response.json()
      endpoint = json.webSocketDebuggerUrl
    } catch (err) {
      console.error('Something went wrong', err)
    }
  })

  afterAll(() => {
    browser!.disconnect()
    app!.kill()
    app = null
  })

  it('works', async () => {
    browser = await puppeteer.connect({ browserWSEndpoint: endpoint! })

    const pages = await browser!.pages()
    const page = pages.find(x => x.url().includes('file:///'))

    if (!page) {
      console.log('Page not found...')
      return
    }

    const content = await page.$eval(
      '#desktop-app-container',
      el => el.textContent
    )

    expect(content).not.toBeNull()
  })
})
