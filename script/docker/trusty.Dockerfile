FROM ubuntu:trusty

RUN apt-get update
RUN apt-get install --quiet --yes \
    build-essential \
    curl \
    pkg-config \
    clang \
    python \
    # to be able to use add-apt-repository below
    software-properties-common \
    python-software-properties \
    # required to compile keytar
    libsecret-1-dev \
    # essential for testing Electron in a headless fashion
    # https://github.com/electron/electron/blob/master/docs/tutorial/testing-on-headless-ci.md
    libgtk-3-0 \
    libxtst6 \
    libxss1 \
    libgconf-2-4 \
    libasound2 \
    unzip \
    xvfb

# ensure we are running a recent version of Git
RUN add-apt-repository ppa:git-core/ppa

# install the latest LTS version of Node
RUN curl -sL https://deb.nodesource.com/setup_12.x | bash -

# install the latest version of Yarn
RUN curl -sS https://dl.yarnpkg.com/debian/pubkey.gpg | apt-key add -
RUN echo "deb https://dl.yarnpkg.com/debian/ stable main" | tee /etc/apt/sources.list.d/yarn.list
RUN apt-get update && apt-get install --no-install-recommends --yes --quiet git nodejs yarn
