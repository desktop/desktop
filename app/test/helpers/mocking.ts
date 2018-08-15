import * as sinon from 'sinon'
import rewiremock from 'rewiremock/node'

require('jsdom-global')()

rewiremock('electron').by('./fake-electron.ts')
rewiremock.enable()

global.localStorage = {
  getItem: sinon.fake(),
}
global.Headers = sinon.fake()
