// set test timeout to 10s
jest.setTimeout(10000)

import 'jest-extended'

delete process.env['LOCAL_GIT_DIRECTORY']
delete process.env['GIT_EXEC_PATH']
