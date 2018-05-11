import { expect } from 'chai'

import * as webdriver from 'selenium-webdriver'
const { findElement, getText, click } = require('selenium-adapter')

// SETUP
// 0. yarn install
// 1. run chromedriver's bin `$ ./node_modules/.bin/chromedriver` (if ENOENT error, do yarn add electron-chromedriver --dev)
// 2. find your desktop binary and update variable below
// 3. change the test's `expect` to equal the name of your first repo in the repo list dropdown
// 4. make sure you're not running Desktop any more
// 5. on another tab, run: `$ yarn mocha -t 30000 --require ts-node/register app/test/integration/selenium-launch.ts`

// NOTE
// * i might migrate to puppeteer for fun
// * selenium-adapter is from a friend's repo (vinsonchuong on github), not needed but it's nice to have around

const WAIT_BEFORE_OPEN = 1 // will not scale well! we should do a wait until for a title to appear
const WAIT_BEFORE_CLOSE = 0 // in case you want to inspect as you're testing before you lose your spot

// NOTE!!! you must locate your desktop app's binary that you want to use. eventually we'll have URL
// from central to download, setup, and run tests on (especially if we want this in CI)
const DESKTOP_BINARY_LOCATION =
  '/Applications/GitHub Desktop.app/Contents/MacOS/GitHub Desktop' // change this according to your machine

async function openDesktop() {
  const driver = await new webdriver.Builder()
    .usingServer('http://localhost:9515')
    .withCapabilities({
      chromeOptions: { binary: DESKTOP_BINARY_LOCATION },
    })
    .forBrowser('electron')
    .build()

  await driver.sleep(WAIT_BEFORE_OPEN * 1000)
  return driver
}

async function closeDesktop(driver: webdriver.WebDriver) {
  await driver.sleep(WAIT_BEFORE_CLOSE * 1000)
  await driver.quit()
}

describe('Repository Dropdown', () => {
  it('can show repository names', async () => {
    // BEFORE EACH (eventually pull out to actual `beforeEach`)
    // note: challenge is getting the driver and passing it into each test; especially if we paralellize
    const driver = await openDesktop()

    // TEST
    await openDropdown(driver)
    const repositoryItemText = await getFirstRepository(driver)

    expect(repositoryItemText).to.equal('adacats') // customized to first repo on *my computer*

    // AFTER EACH (eventually pull out to actual `afterEach`)
    await closeDesktop(driver)
  })
})

async function openDropdown(driver: webdriver.WebDriver) {
  const repositoryDropdown = await findElement(driver, '.button-component')
  await click(repositoryDropdown)

  await driver.sleep(WAIT_BEFORE_OPEN * 1000) // hacky fix. needs better solution. will not work well on CI
}

async function getFirstRepository(driver: webdriver.WebDriver) {
  const repositoryDropdownElement = await findElement(
    driver,
    '.repository-list-item'
  )
  return await getText(repositoryDropdownElement)
}
