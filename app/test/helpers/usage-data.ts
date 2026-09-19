import assert from 'node:assert'
import { dirname, resolve } from 'node:path'
import ts from 'typescript'

import { buildStatsPayload } from '../../src/lib/stats/stats-store'

type StatsPayload = Parameters<typeof buildStatsPayload>[0]
type ITelemetryPayload = ReturnType<typeof buildStatsPayload>

function getDailyStatsType(): {
  readonly checker: ts.TypeChecker
  readonly type: ts.Type
} {
  const configPath = resolve('tsconfig.json')
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile)

  if (configFile.error !== undefined) {
    throw new Error(
      ts.formatDiagnostic(configFile.error, {
        getCanonicalFileName: fileName => fileName,
        getCurrentDirectory: ts.sys.getCurrentDirectory,
        getNewLine: () => ts.sys.newLine,
      })
    )
  }

  const config = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    dirname(configPath)
  )
  const statsStorePath = resolve('app/src/lib/stats/stats-store.ts')
  const program = ts.createProgram([statsStorePath], config.options)
  const sourceFile = program.getSourceFile(statsStorePath)

  assert.notStrictEqual(sourceFile, undefined)

  const dailyStatsDeclaration = sourceFile?.statements.find(
    statement =>
      ts.isTypeAliasDeclaration(statement) &&
      statement.name.text === 'DailyStats'
  )

  assert.ok(
    dailyStatsDeclaration !== undefined &&
      ts.isTypeAliasDeclaration(dailyStatsDeclaration),
    'Could not find the DailyStats type alias'
  )

  const checker = program.getTypeChecker()
  return {
    checker,
    type: checker.getTypeAtLocation(dailyStatsDeclaration),
  }
}

function withoutUndefined(type: ts.Type): ReadonlyArray<ts.Type> {
  const types = type.isUnion() ? type.types : [type]
  return types.filter(member => (member.flags & ts.TypeFlags.Undefined) === 0)
}

function hasFlag(types: ReadonlyArray<ts.Type>, flag: ts.TypeFlags): boolean {
  return types.some(type => (type.flags & flag) !== 0)
}

function exampleValueForType(type: ts.Type): string | number | boolean | null {
  const types = withoutUndefined(type)

  if (hasFlag(types, ts.TypeFlags.Null)) {
    return null
  }

  if (
    hasFlag(
      types,
      ts.TypeFlags.Number | ts.TypeFlags.NumberLiteral | ts.TypeFlags.NumberLike
    )
  ) {
    return 1
  }

  if (
    hasFlag(
      types,
      ts.TypeFlags.Boolean |
        ts.TypeFlags.BooleanLiteral |
        ts.TypeFlags.BooleanLike
    )
  ) {
    return true
  }

  const stringLiteral = types.find(type => type.isStringLiteral())
  if (stringLiteral !== undefined) {
    return stringLiteral.value
  }

  if (
    hasFlag(
      types,
      ts.TypeFlags.String | ts.TypeFlags.StringLiteral | ts.TypeFlags.StringLike
    )
  ) {
    return 'example'
  }

  throw new Error(`Unsupported stats property type: ${type.flags}`)
}

function buildExampleStatsPayload(): StatsPayload {
  const { checker, type } = getDailyStatsType()
  const entries = checker.getPropertiesOfType(type).map(property => {
    const declaration = property.valueDeclaration ?? property.declarations?.[0]
    if (declaration === undefined) {
      throw new Error(`Could not find the declaration for ${property.name}`)
    }

    const propertyType = checker.getTypeOfSymbolAtLocation(
      property,
      declaration
    )
    return [property.name, exampleValueForType(propertyType)]
  })

  return Object.fromEntries(entries) as StatsPayload
}

export function generateUsageDataExample(): ITelemetryPayload {
  return buildStatsPayload(buildExampleStatsPayload())
}
