import { describe, it } from 'node:test'
import assert from 'node:assert'
import { parseAddSSHHostPrompt } from '../../src/lib/ssh/ssh'

describe('SSH', () => {
  describe('parsing SSH prompts', () => {
    it('extracts info from the bundled OpenSSH host key fingerprint prompt', () => {
      const prompt = `The authenticity of host 'my-domain.com (1.2.3.4)' can't be established.
ED25519 key fingerprint is: SHA256:ThisIsAFakeFingerprintForTestingPurposes
This key is not known by any other names.
Are you sure you want to continue connecting (yes/no/[fingerprint])? `

      const info = parseAddSSHHostPrompt(prompt)

      assert.deepStrictEqual(info, {
        host: 'my-domain.com',
        ip: '1.2.3.4',
        fingerprint: 'SHA256:ThisIsAFakeFingerprintForTestingPurposes',
        keyType: 'ED25519',
      })
    })

    it('extracts info from the bundled OpenSSH prompt when keys of different type are available', () => {
      const prompt = `The authenticity of host 'my-domain.com (1.2.3.4)' can't be established
but keys of different type are already known for this host.
ED25519 key fingerprint is: SHA256:ThisIsAFakeFingerprintForTestingPurposes
This key is not known by any other names.
Are you sure you want to continue connecting (yes/no/[fingerprint])? `

      const info = parseAddSSHHostPrompt(prompt)

      assert.deepStrictEqual(info, {
        host: 'my-domain.com',
        ip: '1.2.3.4',
        fingerprint: 'SHA256:ThisIsAFakeFingerprintForTestingPurposes',
        keyType: 'ED25519',
      })
    })

    it('rejects prompts with an empty fingerprint instead of capturing subsequent lines', () => {
      for (const separator of ['is', 'is:']) {
        const prompt = `The authenticity of host 'my-domain.com (1.2.3.4)' can't be established.
ED25519 key fingerprint ${separator} \nThis key is not known by any other names.
Are you sure you want to continue connecting (yes/no/[fingerprint])? `

        assert.strictEqual(parseAddSSHHostPrompt(prompt), null)
      }
    })

    it('extracts info from github.com host key fingerprint', () => {
      const prompt = `The authenticity of host 'github.com (140.82.121.3)' can't be established.
RSA key fingerprint is SHA256:nThbg6kXUpJWGl7E1IGOCspRomTxdCARLviKw6E5SY8.
Are you sure you want to continue connecting (yes/no/[fingerprint])? `

      const info = parseAddSSHHostPrompt(prompt)

      assert.deepStrictEqual(info, {
        host: 'github.com',
        ip: '140.82.121.3',
        fingerprint: 'SHA256:nThbg6kXUpJWGl7E1IGOCspRomTxdCARLviKw6E5SY8',
        keyType: 'RSA',
      })
    })

    it('extracts info from fake host key fingerprint', () => {
      const prompt = `The authenticity of host 'my-domain.com (1.2.3.4)' can't be established.
FAKE-TYPE key fingerprint is ThisIsAFakeFingerprintForTestingPurposes.
This key is not known by any other names.
Are you sure you want to continue connecting (yes/no/[fingerprint])? `

      const info = parseAddSSHHostPrompt(prompt)

      assert.deepStrictEqual(info, {
        host: 'my-domain.com',
        ip: '1.2.3.4',
        fingerprint: 'ThisIsAFakeFingerprintForTestingPurposes',
        keyType: 'FAKE-TYPE',
      })
    })

    it('extracts info from fake host key fingerprint when keys of different type are available', () => {
      const prompt = `The authenticity of host 'my-domain.com (1.2.3.4)' can't be established
but keys of different type are already known for this host.
FAKE-TYPE key fingerprint is ThisIsAFakeFingerprintForTestingPurposes.
Are you sure you want to continue connecting (yes/no/[fingerprint])? `

      const info = parseAddSSHHostPrompt(prompt)

      assert.deepStrictEqual(info, {
        host: 'my-domain.com',
        ip: '1.2.3.4',
        fingerprint: 'ThisIsAFakeFingerprintForTestingPurposes',
        keyType: 'FAKE-TYPE',
      })
    })

    it('extract info when [fingerprint] option is not present', () => {
      const prompt = `The authenticity of host 'my-domain.com (1.2.3.4)' can't be established.
FAKE-TYPE key fingerprint is ThisIsAFakeFingerprintForTestingPurposes.
This key is not known by any other names.
Are you sure you want to continue connecting (yes/no)? `

      const info = parseAddSSHHostPrompt(prompt)

      assert.deepStrictEqual(info, {
        host: 'my-domain.com',
        ip: '1.2.3.4',
        fingerprint: 'ThisIsAFakeFingerprintForTestingPurposes',
        keyType: 'FAKE-TYPE',
      })
    })
  })
})
