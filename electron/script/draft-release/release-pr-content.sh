#!/bin/bash

if [ "$#" -ne 2 ]; then
  echo "Usage: $0 <title|body> <branch-name>"
  exit 1
fi

OUTPUT_TYPE=$1
BRANCH_NAME=$2
VERSION=$(echo ${BRANCH_NAME#releases/})

# For title just echo "Release version"
if [ "$OUTPUT_TYPE" = "title" ]; then
  echo "Release ${VERSION}"
  exit 0
fi

# If output type is not body, exit
if [ "$OUTPUT_TYPE" != "body" ]; then
  echo "Unknown output type: $OUTPUT_TYPE"
  exit 1
fi

RELEASE_DESCRIPTION="v${VERSION} production release"
if [[ "$VERSION" == *"-"* ]]; then
  BUILD_TYPE_AND_NUMBER=$(echo ${VERSION##*-})
  if [[ "$BUILD_TYPE_AND_NUMBER" != *"beta"* ]]; then
    echo "Only beta and production builds have release PRs"
  fi
  BUILD_TYPE="beta"
  BUILD_NUMBER=$(echo ${BUILD_TYPE_AND_NUMBER:4})
  case $BUILD_NUMBER in
    *1[0-9] | *[04-9]) BUILD_NUMBER_SUFFIX="th";;
    *1) BUILD_NUMBER_SUFFIX="st";;
    *2) BUILD_NUMBER_SUFFIX="nd";;
    *3) BUILD_NUMBER_SUFFIX="rd";;
  esac

  RELEASE_DESCRIPTION="${BUILD_NUMBER}${BUILD_NUMBER_SUFFIX} beta of the v${VERSION} series"
fi

echo "## Description
Looking for the PR for the upcoming ${RELEASE_DESCRIPTION}? Well, you've just found it, congratulations!

## Release checklist

- [ ] Check to see if there are any errors in Sentry that have only occurred since the last production release
- [ ] Verify that all feature flags are flipped appropriately
- [ ] If there are any new metrics, ensure that central and desktop.github.com have been updated"
