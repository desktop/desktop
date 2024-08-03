// set test timeout to 10s
jest.setTimeout(10000)

import * as matchers from 'jest-extended'
expect.extend(matchers)

delete process.env['LOCAL_GIT_DIRECTORY']
delete process.env['GIT_EXEC_PATH']
