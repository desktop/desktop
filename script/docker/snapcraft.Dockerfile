FROM snapcore/snapcraft

RUN apt -qq update
RUN apt -qq install --yes curl gnupg

RUN curl -sL https://deb.nodesource.com/setup_12.x | bash -
RUN curl -sS https://dl.yarnpkg.com/debian/pubkey.gpg | apt-key add -
RUN echo "deb https://dl.yarnpkg.com/debian/ stable main" | tee /etc/apt/sources.list.d/yarn.list

# add custom tools required for electron-builder
RUN apt -qq update
RUN apt -qq install --yes \
  nodejs \
  yarn \
  # needed for pacman builds
  bsdtar \
  # needed for RPM builds
  rpm \
  # needed for deb builds using fpm
  binutils \
  # needed for electron-installer-debian
  dpkg \
  fakeroot \
  # needed for tweaking Snap output post-packaging
  squashfs-tools
