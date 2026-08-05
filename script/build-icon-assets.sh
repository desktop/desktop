# Usage: build-icon-asset.sh
# Need xcode for this, xcode command line tools is not enough

# exit immediately if a command exits with a non-zero status.
set -e

# print commands and their arguments as they are executed.
set -x

function compile() {
  rm -f Assets.car icon-logo.icns

  echo "`pwd`"

  OUTDIR=$(mktemp -d)
  PLISTPATH="$OUTDIR/Info.plist"

  xcrun -v actool "icon-logo.icon" --compile $OUTDIR \
  --output-format human-readable-text \
  --notices --warnings --errors \
  --output-partial-info-plist $PLISTPATH \
  --app-icon icon-logo \
  --include-all-app-icons \
  --enable-on-demand-resources NO \
  --development-region en \
  --target-device mac \
  --minimum-deployment-target 26.0 \
  --platform macosx

  mv $OUTDIR/Assets.car ./
  mv $OUTDIR/icon-logo.icns ./
  rm -rf $OUTDIR
}

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR/../app/static/logos"

echo "`pwd`"

# So I have absolutely no idea why but it seems actool gets
# "stuck" sometimes and ignores whatever directory we're switching to and just
# compiles in the last folder it was in. So for example, it could get stuck in the
# prod folder so that the dev folder always gets the prod icons.
#
# If you delete the prod folder and run the script without attempting to compile prod
# it'll give you some error about cwd being nil. Luckily we won't have to do this all
# that often but if you're attempting to regenerate the Assets.car file I would suggest
# doing one folder at a time, zipping up the other to get it out of the way. 
#
# /* com.apple.actool.errors */
# error: NSString *IBCurrentDirectoryPath(NSError *__autoreleasing *) – currentDirectoryPath is unexpectedly nil
#     Failure Reason: Operation not permitted
# error: Not enough arguments provided; where is the input document to operate on?
(cd "prod" && compile)
(cd "dev" && compile)
