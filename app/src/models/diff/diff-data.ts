import { DiffHunk } from './raw-diff'
import { Image } from './image'
/**
 * V8 has a limit on the size of string it can create, and unless we want to
 * trigger an unhandled exception we need to do the encoding conversion by hand
 */
export const maximumDiffStringSize = 268435441

export enum DiffType {
  /** Changes to a text file, which may be partially selected for commit */
  Text,
  /** Changes to a file with a known extension, which can be viewed in the app */
  Image,
  /** Changes to an unknown file format, which Git is unable to present in a human-friendly format */
  Binary,
  /** Change to a repository which is included as a submodule of this repository */
  Submodule,
  /** Diff is large enough to degrade ux if rendered */
  LargeText,
  /** Diff that will not be rendered */
  Unrenderable,
}

type LineEnding = 'CR' | 'LF' | 'CRLF'

export type LineEndingsChange = {
  from: LineEnding
  to: LineEnding
}

/** Parse the line ending string into an enum value (or `null` if unknown) */
export function parseLineEndingText(text: string): LineEnding | null {
  const input = text.trim()
  switch (input) {
    case 'CR':
      return 'CR'
    case 'LF':
      return 'LF'
    case 'CRLF':
      return 'CRLF'
    default:
      return null
  }
}

/**
 * Data returned as part of a textual diff from Desktop
 */
interface ITextDiffData {
  /** The unified text diff - including headers and context */
  readonly text: string
  /** The diff contents organized by hunk - how the git CLI outputs to the caller */
  readonly hunks: ReadonlyArray<DiffHunk>
  /** A warning from Git that the line endings have changed in this file and will affect the commit */
  readonly lineEndingsChange?: LineEndingsChange
}

export interface ITextDiff extends ITextDiffData {
  readonly kind: DiffType.Text
}

/**
 * Data returned as part of an image diff in Desktop
 */
export interface IImageDiff {
  readonly kind: DiffType.Image

  /**
   * The previous image, if the file was modified or deleted
   *
   * Will be undefined for an added image
   */
  readonly previous?: Image
  /**
   * The current image, if the file was added or modified
   *
   * Will be undefined for a deleted image
   */
  readonly current?: Image
}

export interface IBinaryDiff {
  readonly kind: DiffType.Binary
}

export interface ILargeTextDiff extends ITextDiffData {
  readonly kind: DiffType.LargeText
}

export interface IUnrenderableDiff {
  readonly kind: DiffType.Unrenderable
}

/** The union of diff types that can be rendered in Desktop */
export type IDiff =
  | ITextDiff
  | IImageDiff
  | IBinaryDiff
  | ILargeTextDiff
  | IUnrenderableDiff
