declare module 'mri' {
  namespace mri {
    /** A string or array of strings */
    type ArrayOrString = string | ReadonlyArray<string>

    /** An object with any keys whose values conform to a specific type */
    type DictionaryObject<T = any> = {
      [key: string]: T
    }

    interface IOptions {
      /** Additional aliases for specific flags */
      alias?: DictionaryObject<ArrayOrString>
      /** A flag or array of flags whose values are boolean */
      boolean?: ArrayOrString
      /** Default values for flags */
      default?: DictionaryObject
      string?: ArrayOrString
      unknown?: (flag: string) => void
    }

    interface IArgv extends DictionaryObject {
      /** anything after `--` or between options */
      _: ReadonlyArray<string>
    }

    type MRI = (args: ReadonlyArray<string>, options?: IOptions) => IArgv
  }

  const mri: mri.MRI
  export = mri
}
