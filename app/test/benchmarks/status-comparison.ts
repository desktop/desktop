import {
  getStatus,
  getStatusRaw,
  getStatusSpawn,
  getStatusSpawnRaw,
} from '../../src/lib/git'
import { Repository } from '../../src/models/repository'
import * as Path from 'path'

import * as heapdump from 'heapdump'

// hacks to get Benchmark working properly yaaaay
import _ from 'lodash'
import process from 'process'

const benchmark = require('benchmark')
const Benchmark = benchmark.runInContext({ _, process })
const hack = window as any
hack.Benchmark = Benchmark

const SLOW_TEST_RUN_COUNT = 10

async function timeSlowTest(
  action: () => Promise<any>
): Promise<number | null> {
  const startTime = performance && performance.now ? performance.now() : null

  await action()

  if (startTime != null) {
    const rawTime = performance.now() - startTime
    return rawTime
  } else {
    return null
  }
}

function computeAverage(context: string, values: ReadonlyArray<number>) {
  console.log(
    `[${context}] values ${JSON.stringify(
      values.map(v => (v / 1000).toFixed(3))
    )}`
  )

  let total = 0
  values.forEach(v => (total += v))
  const averageTime = total / values.length
  const timeInSeconds = (averageTime / 1000).toFixed(3)

  console.log(
    `[${context}] averaged ${timeInSeconds}s over ${values.length} runs`
  )
}

const root = Path.dirname(Path.dirname(Path.dirname(__dirname)))
const dugitePath = Path.join(Path.dirname(root), 'dugite')
console.log(`dugite repo: ${dugitePath}`)

const dugiteRepo = new Repository(dugitePath, -1, null, false)

const classroomPath = Path.join(Path.dirname(root), 'classroom-desktop')

console.log(`github-classroom repo: ${classroomPath}`)

const classroomRepo = new Repository(classroomPath, -1, null, false)

describe('status benchmark', () => {
  describe('❗️  no working directory changes', () => {
    it('☝️  pass-thru from Node - no parsing', done => {
      const suite = new Benchmark.Suite('status')

      suite
        .add('GitProcess.exec', async function() {
          await getStatusRaw(dugiteRepo)
        })
        .add('GitProcess.spawn', async function() {
          await getStatusSpawnRaw(dugiteRepo)
        })
        .on('cycle', function(event: { target: any }) {
          console.log(String(event.target))
        })
        .on('complete', function() {
          done()
        })
        .run({ async: true })
    })

    it('☝️  parsing output and generating objects', done => {
      const suite = new Benchmark.Suite('status')

      suite
        .add('GitProcess.exec', async function() {
          await getStatus(dugiteRepo)
        })
        .add('GitProcess.spawn', async function() {
          await getStatusSpawn(dugiteRepo)
        })
        .on('cycle', function(event: { target: any }) {
          console.log(String(event.target))
        })
        .on('complete', function() {
          done()
        })
        .run({ async: true })
    })
  })

  describe('️❗️  33k untracked changes', () => {
    it('☝️  pass-thru from Node - no parsing', done => {
      const suite = new Benchmark.Suite('status')

      suite
        .add('GitProcess.exec (raw)', async function() {
          await getStatusRaw(classroomRepo)
        })
        .add('GitProcess.spawn (raw)', async function() {
          await getStatusSpawnRaw(classroomRepo)
        })
        .on('cycle', function(event: { target: any }) {
          console.log(String(event.target))
        })
        .on('complete', function() {
          done()
        })
        .run({ async: true })
    })

    it('☝️  parsing output and generating objects - current approach', async () => {
      heapdump.writeSnapshot('exec-before.heapsnapshot', err => {
        if (err) {
          console.log(`couldn't write before snapshot`, err)
        }
      })

      const values = new Array<number>()
      const context = 'GitProcess.exec'

      for (let i = 0; i < SLOW_TEST_RUN_COUNT; i++) {
        const time = await timeSlowTest(() => getStatus(classroomRepo))
        if (time == null) {
          console.log(
            `unable to record time as APIs don't exist in this context`
          )
        } else {
          values.push(time)
        }
      }

      computeAverage(context, values)

      heapdump.writeSnapshot('exec-after.heapsnapshot', err => {
        if (err) {
          console.log(`couldn't write after snapshot`, err)
        }
      })
    })

    it('☝️  parsing output and generating objects - new spawn-based approach', async () => {
      heapdump.writeSnapshot('spawn-before.heapsnapshot', err => {
        if (err) {
          console.log(`couldn't write before snapshot`, err)
        }
      })

      const values = new Array<number>()
      const context = 'GitProcess.spawn'

      for (let i = 0; i < SLOW_TEST_RUN_COUNT; i++) {
        const time = await timeSlowTest(() => getStatusSpawn(classroomRepo))
        if (time == null) {
          console.log(
            `unable to record time as APIs don't exist in this context`
          )
        } else {
          values.push(time)
        }
      }

      computeAverage(context, values)

      heapdump.writeSnapshot('spawn-after.heapsnapshot', err => {
        if (err) {
          console.log(`couldn't write after snapshot`, err)
        }
      })
    })
  })
})
