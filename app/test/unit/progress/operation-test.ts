import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  CheckoutProgressParser,
  CloneProgressParser,
  FetchProgressParser,
  GitProgressParser,
  PullProgressParser,
  PushProgressParser,
} from '../../../src/lib/progress'

function assertProgress(
  parser: GitProgressParser,
  title: string,
  value: number,
  expectedPercent: number,
  done = false
) {
  const text = `${title}: ${value}% (${value}/100)${done ? ', done.' : ''}`
  const { percent, ...result } = parser.parse(text)

  assert.ok(
    Math.abs(percent - expectedPercent) < 1e-12,
    `Expected progress ${expectedPercent}, got ${percent}`
  )
  assert.deepStrictEqual(result, {
    kind: 'progress',
    details: {
      title,
      text,
      value,
      total: 100,
      percent: value,
      done,
    },
  })
}

for (const { Parser, start, weight } of [
  { Parser: CheckoutProgressParser, start: 0, weight: 1 },
  { Parser: CloneProgressParser, start: 0.8, weight: 0.2 },
  { Parser: PullProgressParser, start: 19 / 22, weight: 3 / 22 },
]) {
  describe(Parser.name, () => {
    for (const title of ['Checking out files', 'Updating files']) {
      it(`preserves the checkout weight for ${title}`, () => {
        const parser = new Parser()
        assertProgress(parser, title, 50, start + weight / 2)
        assertProgress(parser, title, 100, 1, true)
        assert.deepStrictEqual(parser.parse('Finished'), {
          kind: 'context',
          text: 'Finished',
          percent: 1,
        })
      })
    }
  })
}

for (const { Parser, title, weight, nextTitle, nextWeight, finalTitle } of [
  {
    Parser: CloneProgressParser,
    title: 'remote: Compressing objects',
    weight: 0.1,
    nextTitle: 'Receiving objects',
    nextWeight: 0.6,
    finalTitle: 'Updating files',
  },
  {
    Parser: FetchProgressParser,
    title: 'remote: Compressing objects',
    weight: 0.1,
    nextTitle: 'Receiving objects',
    nextWeight: 0.7,
    finalTitle: 'Resolving deltas',
  },
  {
    Parser: PullProgressParser,
    title: 'remote: Compressing objects',
    weight: 1 / 11,
    nextTitle: 'Receiving objects',
    nextWeight: 7 / 11,
    finalTitle: 'Updating files',
  },
  {
    Parser: PushProgressParser,
    title: 'Compressing objects',
    weight: 0.2,
    nextTitle: 'Writing objects',
    nextWeight: 0.7,
    finalTitle: 'remote: Resolving deltas',
  },
]) {
  describe(`${Parser.name} compression`, () => {
    for (const compressionTitle of [title, `${title} by path`]) {
      it(`uses one compression weight for ${compressionTitle}`, () => {
        const parser = new Parser()
        assertProgress(parser, compressionTitle, 50, weight / 2)
        assertProgress(parser, compressionTitle, 100, weight, true)
        assertProgress(parser, nextTitle, 50, weight + nextWeight / 2)
        assertProgress(parser, finalTitle, 100, 1, true)
      })
    }

    it('does not regress or double-count when ordinary compression follows path compression', () => {
      const parser = new Parser()
      assertProgress(parser, `${title} by path`, 25, weight / 4)
      assertProgress(parser, `${title} by path`, 100, weight, true)
      assertProgress(parser, title, 10, weight)
      assertProgress(parser, title, 100, weight, true)
      assertProgress(parser, nextTitle, 50, weight + nextWeight / 2)

      const lateText = `${title} by path: 100% (100/100), done.`
      const lateProgress = parser.parse(lateText)
      assert(lateProgress.kind === 'context')
      assert.strictEqual(lateProgress.text, lateText)
      assert.ok(
        Math.abs(lateProgress.percent - (weight + nextWeight / 2)) < 1e-12
      )

      assertProgress(parser, finalTitle, 100, 1, true)
    })

    it('continues advancing when ordinary compression exceeds the last path-compression progress', () => {
      const parser = new Parser()
      assertProgress(parser, `${title} by path`, 25, weight / 4)
      assertProgress(parser, title, 10, weight / 4)
      assertProgress(parser, title, 50, weight / 2)
      assertProgress(parser, title, 100, weight, true)
    })

    it('only recognizes exact compression titles', () => {
      const parser = new Parser()
      const text = `${title} by pathname: 50% (50/100)`
      assert.deepStrictEqual(parser.parse(text), {
        kind: 'context',
        percent: 0,
        text,
      })
    })

    it('keeps the compression weight when the compression step is skipped', () => {
      const parser = new Parser()
      assertProgress(parser, nextTitle, 50, weight + nextWeight / 2)
      assertProgress(parser, finalTitle, 100, 1, true)
    })
  })
}
