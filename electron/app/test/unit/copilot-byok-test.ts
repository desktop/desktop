import assert from 'node:assert'
import { afterEach, describe, it } from 'node:test'
import {
  encodeModelKey,
  isLocalBaseUrl,
  isValidBYOKBaseUrl,
  loadBYOKProviders,
  parseModelKey,
  requiresNewBYOKSecret,
  saveBYOKProviders,
  type IBYOKProvider,
} from '../../src/lib/copilot/byok'

const StorageKey = 'copilot-byok-providers'

const sampleProvider: IBYOKProvider = {
  id: 'p1',
  name: 'OpenAI',
  type: 'openai',
  baseUrl: 'https://api.openai.com/v1',
  wireApi: 'completions',
  authKind: 'apiKey',
  models: [{ id: 'gpt-4o', name: 'GPT-4o', reasoningEffort: 'medium' }],
}

afterEach(() => localStorage.clear())

describe('byok storage', () => {
  it('round-trips providers through localStorage', () => {
    saveBYOKProviders([sampleProvider])
    const loaded = loadBYOKProviders()
    assert.deepStrictEqual(loaded, [sampleProvider])
  })

  it('returns an empty list when no providers have been stored', () => {
    assert.deepStrictEqual(loadBYOKProviders(), [])
  })

  it('removes the storage entry when saving an empty list', () => {
    saveBYOKProviders([sampleProvider])
    saveBYOKProviders([])
    assert.strictEqual(localStorage.getItem(StorageKey), null)
  })

  it('returns an empty list when the stored value is malformed', () => {
    localStorage.setItem(StorageKey, '{not json')
    assert.deepStrictEqual(loadBYOKProviders(), [])
  })

  it('filters out entries that fail validation', () => {
    localStorage.setItem(
      StorageKey,
      JSON.stringify([
        sampleProvider,
        { id: 'x', name: 'Bad', type: 'openai' }, // missing baseUrl, models
      ])
    )
    assert.deepStrictEqual(loadBYOKProviders(), [sampleProvider])
  })
})

describe('encode/parseModelKey', () => {
  it('round-trips copilot keys', () => {
    const key = { kind: 'copilot' as const, modelId: 'gpt-5-mini' }
    assert.deepStrictEqual(parseModelKey(encodeModelKey(key)), key)
  })

  it('round-trips byok keys', () => {
    const key = {
      kind: 'byok' as const,
      providerId: 'abc',
      modelId: 'llama3',
    }
    assert.deepStrictEqual(parseModelKey(encodeModelKey(key)), key)
  })

  it('treats legacy bare strings as copilot model IDs', () => {
    assert.deepStrictEqual(parseModelKey('claude-sonnet'), {
      kind: 'copilot',
      modelId: 'claude-sonnet',
    })
  })

  it('handles model IDs that contain colons', () => {
    const key = {
      kind: 'byok' as const,
      providerId: 'p',
      modelId: 'llama3:latest',
    }
    assert.deepStrictEqual(parseModelKey(encodeModelKey(key)), key)
  })

  it('falls back to an empty copilot model on a malformed BYOK key', () => {
    assert.deepStrictEqual(parseModelKey('byok:'), {
      kind: 'copilot',
      modelId: '',
    })
    assert.deepStrictEqual(parseModelKey('byok:onlyone'), {
      kind: 'copilot',
      modelId: '',
    })
  })
})

describe('isValidBYOKBaseUrl', () => {
  it('accepts https URLs', () => {
    assert.strictEqual(isValidBYOKBaseUrl('https://api.openai.com/v1'), true)
  })

  it('accepts http URLs that point at the local machine', () => {
    assert.strictEqual(isValidBYOKBaseUrl('http://localhost:11434/v1'), true)
    assert.strictEqual(isValidBYOKBaseUrl('http://127.0.0.1:11434/'), true)
    assert.strictEqual(isValidBYOKBaseUrl('http://[::1]:11434/'), true)
  })

  it('rejects http URLs that point at non-loopback hosts', () => {
    assert.strictEqual(isValidBYOKBaseUrl('http://api.openai.com/v1'), false)
    assert.strictEqual(isValidBYOKBaseUrl('http://192.168.1.5/'), false)
    assert.strictEqual(isValidBYOKBaseUrl('http://0.0.0.0:11434/'), false)
  })

  it('rejects file:// URLs', () => {
    assert.strictEqual(isValidBYOKBaseUrl('file:///etc/passwd'), false)
  })

  it('rejects javascript: URLs', () => {
    assert.strictEqual(isValidBYOKBaseUrl('javascript:alert(1)'), false)
  })

  it('rejects ftp:// and other non-http schemes', () => {
    assert.strictEqual(isValidBYOKBaseUrl('ftp://example.com/'), false)
    assert.strictEqual(isValidBYOKBaseUrl('data:text/plain,hi'), false)
  })

  it('rejects strings that are not absolute URLs', () => {
    assert.strictEqual(isValidBYOKBaseUrl(''), false)
    assert.strictEqual(isValidBYOKBaseUrl('not a url'), false)
    assert.strictEqual(isValidBYOKBaseUrl('/api/v1'), false)
  })
})

describe('loadBYOKProviders URL validation', () => {
  it('rejects providers whose stored baseUrl is not http(s)', () => {
    localStorage.setItem(
      'copilot-byok-providers',
      JSON.stringify([
        sampleProvider,
        { ...sampleProvider, id: 'p2', baseUrl: 'file:///etc/passwd' },
        { ...sampleProvider, id: 'p3', baseUrl: 'javascript:alert(1)' },
        { ...sampleProvider, id: 'p4', baseUrl: 'not-a-url' },
      ])
    )
    const loaded = loadBYOKProviders()
    assert.deepStrictEqual(
      loaded.map(p => p.id),
      ['p1']
    )
  })
})

describe('isLocalBaseUrl', () => {
  it('matches localhost and 127.0.0.1', () => {
    assert.strictEqual(isLocalBaseUrl('http://localhost:11434'), true)
    assert.strictEqual(isLocalBaseUrl('http://127.0.0.1:11434'), true)
  })

  it('matches the rest of the 127/8 loopback block', () => {
    assert.strictEqual(isLocalBaseUrl('http://127.0.0.2/'), true)
    assert.strictEqual(isLocalBaseUrl('http://127.1.2.3/'), true)
  })

  it('does not match 0.0.0.0', () => {
    assert.strictEqual(isLocalBaseUrl('http://0.0.0.0:11434/'), false)
  })

  it('does not match malformed 127/8 addresses', () => {
    assert.strictEqual(isLocalBaseUrl('http://127.999.0.1/'), false)
  })

  it('matches IPv6 loopback in bracketed form', () => {
    assert.strictEqual(isLocalBaseUrl('http://[::1]:11434/'), true)
  })

  it('does not match other private addresses', () => {
    assert.strictEqual(isLocalBaseUrl('http://192.168.1.5/'), false)
    assert.strictEqual(isLocalBaseUrl('http://10.0.0.1/'), false)
  })

  it('does not match public hosts', () => {
    assert.strictEqual(isLocalBaseUrl('https://api.openai.com/v1'), false)
  })

  it('returns false for malformed URLs', () => {
    assert.strictEqual(isLocalBaseUrl('not a url'), false)
  })
})

describe('requiresNewBYOKSecret', () => {
  const apiKeyProvider: IBYOKProvider = {
    ...sampleProvider,
    authKind: 'apiKey',
  }
  const bearerProvider: IBYOKProvider = {
    ...sampleProvider,
    authKind: 'bearer',
  }
  const noneProvider: IBYOKProvider = { ...sampleProvider, authKind: 'none' }

  it('never requires a secret when the new auth kind is none', () => {
    assert.strictEqual(requiresNewBYOKSecret('none', null), false)
    assert.strictEqual(requiresNewBYOKSecret('none', apiKeyProvider), false)
  })

  it('requires a secret for new (non-none) providers', () => {
    assert.strictEqual(requiresNewBYOKSecret('apiKey', null), true)
    assert.strictEqual(requiresNewBYOKSecret('bearer', null), true)
  })

  it('does not require a new secret when editing with the same auth kind', () => {
    assert.strictEqual(requiresNewBYOKSecret('apiKey', apiKeyProvider), false)
    assert.strictEqual(requiresNewBYOKSecret('bearer', bearerProvider), false)
  })

  it('requires a new secret when switching from none to a credential kind', () => {
    assert.strictEqual(requiresNewBYOKSecret('apiKey', noneProvider), true)
    assert.strictEqual(requiresNewBYOKSecret('bearer', noneProvider), true)
  })

  it('requires a new secret when switching between apiKey and bearer', () => {
    assert.strictEqual(requiresNewBYOKSecret('bearer', apiKeyProvider), true)
    assert.strictEqual(requiresNewBYOKSecret('apiKey', bearerProvider), true)
  })
})
