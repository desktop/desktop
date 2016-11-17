const charsetDetector = require("node-icu-charset-detector");
const Iconv = require("iconv").Iconv;

export interface EncodingDetection {
  charset: string,
  language: string,
  confidence: number
}

export interface EncodingConversion {
  result?: string
}

export function debugResult(result: EncodingDetection) {
  console.log(`charset: ${result.charset}`)
  console.log(`language: ${result.language}`)
  console.log(`confidence: ${result.confidence}`)
}

export function tryConvert(buffer: Buffer, charset: string): EncodingConversion {

  let parsedOutput: string | undefined = undefined
  let defaultFailed = false

  try {
    parsedOutput = buffer.toString(charset)
  } catch (x) {
    defaultFailed = true
  }

  if (!defaultFailed) {
    //if (parsedOutput) {
    //  console.log(`initial parse succeeded: ${parsedOutput}`)
    //}
    return { result: parsedOutput }
  }

  let fallbackFailed = false
  try {
    var charsetConverter = new Iconv(charset, "utf8")
    parsedOutput = charsetConverter.convert(buffer).toString()
  } catch (x) {
    fallbackFailed = true
  }

  if (!fallbackFailed) {
    //if (parsedOutput) {
    //  console.log(`fallback parse succeeded: ${parsedOutput}`)
    //}
    return { result: parsedOutput }
  }

  //console.log(`both failed, lol`)

  return { result: parsedOutput }
}

export function detect(buffer: Buffer): EncodingDetection {
  const charset = charsetDetector.detectCharset(buffer)
  return {
    charset: charset.toString(),
    language: charset.language,
    confidence: charset.confidence
  }
}
