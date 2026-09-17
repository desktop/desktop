// @ts-check

const assert = require('node:assert/strict')
const { execFile } = require('node:child_process')
const { it } = require('node:test')
const { promisify } = require('node:util')

it('recognizes TypeScript class props with the configured parser and React rules', async () => {
  const code = `
import * as React from 'react'

interface IExampleProps {
  readonly message: string
}

export class Example extends React.Component<IExampleProps> {
  public render() {
    return <span>{this.props.message}</span>
  }
}
`

  // Load the full ESLint plugin graph outside the application's module mocks.
  const { stdout } = await promisify(execFile)(process.execPath, [
    '--eval',
    `
const { ESLint } = require('eslint')
const eslint = new ESLint({ rulePaths: ['eslint-rules'] })
eslint.lintText(${JSON.stringify(code)}, {
  filePath: 'app/src/ui/example.tsx',
}).then(results => {
  const messages = results.flatMap(result =>
    result.messages.filter(message =>
      message.fatal ||
      message.ruleId === 'react/prop-types' ||
      message.ruleId === 'react/no-unused-prop-types'
    )
  )
  process.stdout.write(JSON.stringify(messages))
})
`,
  ])

  assert.deepEqual(JSON.parse(stdout), [])
})
