#!/usr/bin/env bash
set -euo pipefail

export TARGET_ARCH=arm64
export npm_config_arch=arm64
export npm_config_target_arch=arm64
npm ci
