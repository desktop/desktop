import * as puppeteer from 'puppeteer'
import { getDistPath, getExecutableName } from '../../../script/dist-info'
import { join } from 'path'

const distPath = getDistPath()
const productName = getExecutableName()
const binary = join(
  distPath,
  `${productName}.app`,
  'Contents',
  'MacOS',
  `${productName}`
)

describe('ui', () => {
  let browser: puppeteer.Browser | null = null

  afterAll(() => {
    browser && browser.close()
    browser = null
  })

  it('works', async () => {
    browser = await puppeteer.launch({
      executablePath: binary,
      args: [],
    })

    const pages = await browser.pages()
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
