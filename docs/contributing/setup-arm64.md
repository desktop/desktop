# Setting Up Development Dependencies on ARM64

Desktop can be built and run on arm64 (aarch64) hardware such as a Raspberry Pi 3.
In order to build for arm64, you will need the following:

* A computer with a 64-bit ARMv8 processor.
* A 64-bit OS.  You can use [Ubuntu 16.04](#ubuntu-1604) and then follow the instructions
on setup there.
* Instead of running `yarn` to get all required dependencies on your machine, you will
instead need to run `script/install-arm64-deps.sh`.
* Before building with `yarn build:dev` or `yarn build:prod`, you will need to
set the environment variable `TARGET_ARCH` to `arm64` eg:
```shellsession
export TARGET_ARCH=arm64
```
