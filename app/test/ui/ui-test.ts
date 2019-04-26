import * as puppeteer from 'puppeteer'

const { endpoint } = process.env

describe('ui', () => {
  let browser: puppeteer.Browser | null = null

  afterAll(() => {
    browser && browser.disconnect()
    browser = null
  })

  it('works', async () => {
    browser = await puppeteer.connect({ browserWSEndpoint: endpoint })

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
