'use strict'

const environmentVariables = {
  // setting commit information so that tests don't need to rely on global config
  GIT_AUTHOR_NAME: 'Joe Bloggs',
  GIT_AUTHOR_EMAIL: 'joe.bloggs@somewhere.com',
  GIT_COMMITTER_NAME: 'Joe Bloggs',
  GIT_COMMITTER_EMAIL: 'joe.bloggs@somewhere.com',
  // signalling to dugite to use the bundled Git environment
  TEST_ENV: '1',
  // ensuring Electron doesn't attach to the current console session (Windows only)
  ELECTRON_NO_ATTACH_CONSOLE: '1',
  // speed up ts-node usage by using the new transpile-only mode
  TS_NODE_TRANSPILE_ONLY: 'true',
}

process.env = { ...process.env, ...environmentVariables }
