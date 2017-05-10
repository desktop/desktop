/**
 * This will be run by the `ask-pass-trampoline`.
 */

import { responseForPrompt } from './ask-pass'

const prompt = process.argv[2]
responseForPrompt(prompt).then(response => {
  if (response) {
    process.stdout.write(response)
    process.stdout.end()
  }
})
