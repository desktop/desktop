import * as sinon from 'sinon'
import rewiremock from 'rewiremock/node'

import 'core-js'

require('jsdom-global')()

rewiremock('electron').by('./fake-electron.ts')
rewiremock.enable()

import { Headers, Request, Response, FetchError } from 'node-fetch'

global.Headers = Headers
global.Request = Request
global.Response = Response
global.FetchError = FetchError

global.localStorage = {
  getItem: sinon.fake(),
}
