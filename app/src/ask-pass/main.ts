/**
 * This will be run by the `ask-pass-trampoline`.
 */

import { responseForPrompt } from './ask-pass'
import { appendToAskPassLog } from './logger'

const prompt = process.argv[2]

appendToAskPassLog(`received arguments: ${JSON.stringify(process.argv)}`)
appendToAskPassLog(
  `process.env.DESKTOP_USERNAME: '${process.env.DESKTOP_USERNAME}'`
)
appendToAskPassLog(
  `process.env.DESKTOP_ENDPOINT: '${process.env.DESKTOP_ENDPOINT}'`
)
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
