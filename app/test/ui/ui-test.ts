import * as puppeteer from 'puppeteer'
import { startApp } from '../../../script/start-app'
import { ChildProcess } from 'child_process'
import fetch from 'node-fetch'
import { homedir } from 'os'
import * as FSE from 'fs-extra'
import * as path from 'path'

const waitForLocalHost = require('wait-for-localhost')

const url = `http://localhost:1234/json/version`

async function setup() {
  const rootPath = `${homedir()}/Library/Application Support/GitHub Desktop-ui-test`
  const pathsToDelete = ['IndexedDB', 'Local Storage']

  for (const thing of pathsToDelete) {
    try {
      await FSE.remove(path.join(rootPath, thing))
    } catch (e) {
      console.error(e)
    }
  }
}

jest.setTimeout(75000)

describe('ui', () => {
  let browser: puppeteer.Browser
  let app: ChildProcess | null = null
  let appWindow: puppeteer.Page

  beforeAll(async () => {
    await setup()

    app = startApp() || null

    if (app === null) {
      process.exit(0)
      return
    }

    try {
      await waitForLocalHost({ port: 1234 })

      const response = await fetch(url)
      const json = await response.json()
      const endpoint: string = json.webSocketDebuggerUrl

      browser = await puppeteer.connect({ browserWSEndpoint: endpoint })

      const pages = await browser.pages()
      const page = pages.find(x => x.url().includes('file:///'))

      if (page === undefined) {
        throw new Error('Page could ne be found')
      }

      appWindow = page
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
    const content = await appWindow.$eval(
      '#desktop-app-container',
      el => el.textContent
    )

    expect(content).not.toBeNull()
  })

  it('launces to welcome flow', async () => {
    await appWindow.waitForSelector('.welcome-title', { timeout: 75000 })

    const content = await appWindow.$eval(`.welcome-title`, el => el.innerHTML)

    expect(content).toEqual('Welcome to GitHub&nbsp;Desktop')
  })
})
