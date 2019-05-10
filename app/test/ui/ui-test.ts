import * as puppeteer from 'puppeteer'
import { startApp } from '../../../script/start-app'
import { ChildProcess } from 'child_process'
import fetch from 'node-fetch'
const waitForLocalHost = require('wait-for-localhost')

const url = `http://localhost:1234/json/version`

describe('ui', () => {
  let browser: puppeteer.Browser | null = null
  let endpoint: string | null = null
  let app: ChildProcess | null = null

  beforeAll(async () => {
    app = startApp() || null

    // Investigate using wait-port/wait-for-localhost or some other
    // method to ensure the server is running

    try {
      await waitForLocalHost({ port: 1234 })
      console.log('LOCALHOST READY')

      const response = await fetch(url)
      console.log('FETCHING COMPLETE')

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
