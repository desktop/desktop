#!/usr/bin/env ts-node

import * as Path from 'path'
import * as Fs from 'fs'

import * as Ajv from 'ajv'

const repositoryRoot = Path.dirname(__dirname)
const changelogPath = Path.join(repositoryRoot, 'changelog.json')

const changelog = Fs.readFileSync(changelogPath)

const schema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  properties: {
    releases: {
      type: 'object',
      patternProperties: {
        '^([0-9]+.[0-9]+.[0-9]+)(-beta[0-9]+|-test[0-9]+)?$': {
          type: 'array',
          items: {
            type: 'string',
          },
        },
      },
      additionalProperties: false,
    },
  },
}

const ajv = new Ajv({ allErrors: true })
const validate = ajv.compile(schema)

const valid = validate(changelog)

console.log(`got: ${JSON.stringify(valid)}`)
if (!valid) {
  console.log(validate.errors)
  process.exitCode = -1
} else {
  console.log('The changelog is totally fine')
}
