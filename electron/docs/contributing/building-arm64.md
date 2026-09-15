# Building Desktop for `arm64`

Desktop can be built and run on `arm64` (`aarch64`) hardware such as a Raspberry
Pi 3.

## Requirements

In order to build for `arm64`, you will need the following:

* A computer with a 64-bit ARMv8 processor.
* A 64-bit OS.  You can use [Ubuntu 16.04](#ubuntu-1604) and then follow the
instructions on setup there.

## Setup

Once you have the required tools installed, run this script to install the
dependencies that Desktop needs for `arm64`:

```shellsession
$ script/install-arm64-deps.sh
```

**Note:** Do not use `yarn` here as there is no current way to set environment
variables to rebuild native modules against `arm64`.

Ensure you set the `TARGET_ARCH` environment variable in your shell:

```shellsession
$ export TARGET_ARCH=arm64
```

## Building

After that, you should be able to build the development version of Desktop:

```shellsession
$ yarn build:dev
$ yarn start
```

Or if you want to test the production build:


```shellsession
$ yarn build:prod
$ yarn start:prod
```
