const environmentVariables = {
  // setting commit information so that tests don't need to rely on global config
  GIT_AUTHOR_NAME: 'Joe Bloggs',
  GIT_AUTHOR_EMAIL: 'joe.bloggs@somewhere.com',
  GIT_COMMITTER_NAME: 'Joe Bloggs',
  GIT_COMMITTER_EMAIL: 'joe.bloggs@somewhere.com',
  // signalling to dugite to use the bundled Git environment
  TEST_ENV: '1',
  HOME: '',
  USERPROFILE: '',
}

process.env = { ...process.env, ...environmentVariables }
