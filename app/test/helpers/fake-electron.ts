import * as sinon from 'sinon'

export const shell = sinon.fake()
export const remote = {
  autoUpdater: {
    on: sinon.fake(),
  },
}
