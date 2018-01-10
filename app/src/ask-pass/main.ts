/**
 * This will be run by the `ask-pass-trampoline`.
 */

import { responseForPrompt } from './ask-pass'
import { appendToAskPassLog } from './logger'

const prompt = process.argv[2]

appendToAskPassLog(`received arguments: ${JSON.stringify(process.argv)}`)
appendToAskPassLog(`environment variables: ${JSON.stringify(process.env)}`)
appendToAskPassLog(`received prompt: '${prompt}'`)

responseForPrompt(prompt)
  .then(response => {
    if (response) {
      appendToAskPassLog(`emitting response: ${response.length} characters`)
      process.stdout.write(response)
      process.stdout.end()
    } else {
      appendToAskPassLog(`skipping response as responseForPrompt returned null`)
    }
  })
  .then(() => {
    appendToAskPassLog(`exiting...`)
  })
