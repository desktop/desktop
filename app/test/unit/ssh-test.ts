import { parseAddSSHHostPrompt } from '../../src/lib/ssh/ssh'

describe('SSH', () => {
  describe('parsing SSH prompts', () => {
    it('extracts info from github.com host key fingerprint', () => {
      const prompt = `The authenticity of host 'github.com (140.82.121.3)' can't be established.
RSA key fingerprint is SHA256:nThbg6kXUpJWGl7E1IGOCspRomTxdCARLviKw6E5SY8.
Are you sure you want to continue connecting (yes/no/[fingerprint])? `

      const info = parseAddSSHHostPrompt(prompt)

      expect(info).toEqual({
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

      expect(info).toEqual({
        host: 'my-domain.com',
        ip: '1.2.3.4',
        fingerprint: 'ThisIsAFakeFingerprintForTestingPurposes',
        keyType: 'FAKE-TYPE',
      })
    })
  })
})
