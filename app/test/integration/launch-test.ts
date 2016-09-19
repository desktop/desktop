import * as chai from 'chai'

const chaiAsPromised = require('chai-as-promised')
const { Application } = require('spectron')
const path = require('path')

chai.should()
chai.use(chaiAsPromised)

describe('App', function (this: any) {
  if (process.env.CI) {
    /* tslint:disable:no-invalid-this */
    this.timeout(30000)
  }

  let app: any

  beforeEach(function () {
    let appPath = path.join(__dirname, '..', '..', '..', 'node_modules', '.bin', 'electron')
    if (process.platform === 'win32') {
      appPath += '.cmd'
    }
    app = new Application({
      path: appPath,
      args: [
        path.join(__dirname, '..', '..', '..', 'out'),
      ],
    })
    return app.start()
  })

  beforeEach(function () {
    chaiAsPromised.transferPromiseness = app.transferPromiseness
  })

  afterEach(function () {
    if (app && app.isRunning()) {
      return app.stop()
    }
  })

  it('opens a window on launch', function () {
    return app.client.waitUntilWindowLoaded()
      .getWindowCount().should.eventually.equal(2)
      .browserWindow.isMinimized().should.eventually.be.false
      .browserWindow.isDevToolsOpened().should.eventually.be.false
      .browserWindow.isVisible().should.eventually.be.true
      .browserWindow.isFocused().should.eventually.be.true
      .browserWindow.getBounds().should.eventually.have.property('width').and.be.above(0)
      .browserWindow.getBounds().should.eventually.have.property('height').and.be.above(0)
  })
})
