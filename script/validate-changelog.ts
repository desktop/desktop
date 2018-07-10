#!/usr/bin/env ts-node

import * as Path from 'path'
import * as Fs from 'fs'

import * as Ajv from 'ajv'

function handleError(error: string) {
  console.error(error)
  process.exit(-1)
}

function formatErrors(errors: Ajv.ErrorObject[]): string {
  return errors
    .map(error => {
      const { dataPath, message } = error
      const additionalProperties = error.params as any
      const additionalProperty = additionalProperties.additionalProperty as string

      let additionalPropertyText = ''

      if (additionalProperty != null) {
        additionalPropertyText = `, found: '${
          additionalProperties.additionalProperty
        }'`
      }

      // dataPath starts with a leading "."," which is a bit confusing
      const element = dataPath.substr(1)

      return ` - ${element} - ${message}${additionalPropertyText}`
    })
    .join('\n')
}

const repositoryRoot = Path.dirname(__dirname)
const changelogPath = Path.join(repositoryRoot, 'changelog.json')

// eslint-disable-next-line no-sync
const changelog = Fs.readFileSync(changelogPath, 'utf8')

let changelogObj = null

try {
  changelogObj = JSON.parse(changelog)
} catch {
  handleError(
    'Unable to parse the contents of changelog.json into a JSON object. Please review the file contents.'
  )
}

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
          uniqueItems: true,
        },
      },
      additionalProperties: false,
    },
  },
}

const ajv = new Ajv({ allErrors: true, uniqueItems: true })
const validate = ajv.compile(schema)

const valid = validate(changelogObj)

if (!valid && validate.errors != null) {
  handleError(`Errors: \n${formatErrors(validate.errors)}`)
}

console.log('The changelog is totally fine')
