export TARGET_ARCH=arm64
yarn install --force --ignore-scripts
npm rebuild --arch=arm64 --target_arch=arm64
cd app && yarn install --force --ignore-scripts
npm rebuild --arch=arm64 --target_arch=arm64
cd .. && git submodule update --recursive --init && yarn compile:tslint
