# [GitHub Desktop](https://desktop.github.com) - The Linux Fork

[![CI](https://github.com/shiftkey/desktop/actions/workflows/ci.yml/badge.svg)](https://github.com/shiftkey/desktop/actions/workflows/ci.yml)

[GitHub Desktop](https://desktop.github.com/) is an open-source [Electron](https://www.electronjs.org/)-based
GitHub app. It is written in [TypeScript](https://www.typescriptlang.org) and
uses [React](https://reactjs.org/).

<picture>
  <source
    srcset="https://user-images.githubusercontent.com/634063/202742848-63fa1488-6254-49b5-af7c-96a6b50ea8af.png"
    media="(prefers-color-scheme: dark)"
  />
  <img
    width="1072"
    src="https://user-images.githubusercontent.com/634063/202742985-bb3b3b94-8aca-404a-8d8a-fd6a6f030672.png"
    alt="A screenshot of the GitHub Desktop application showing changes being viewed and committed with two attributed co-authors"
  />
</picture>

## What is this repository for?

This repository contains specific patches on top of the upstream
`desktop/desktop` repository to support Linux usage.

It also hosts preview packages for various Linux distributions:

 - AppImage (`.AppImage`)
 - Debian (`.deb`)
 - RPM (`.rpm`)

Check out the [latest releases](https://github.com/shiftkey/desktop/releases) to
help out with testing on your distribution.

## Repositories

You can use your operating system's package manager to install `github-desktop` and
keep it up to date on Debian/RPM based distributions. There are two options for this:

* A [PackageCloud](https://packagecloud.io/) repository with excellent global connectivity
  but very limited bandwidth. This option will stop working each month when the bandwidth
  limit is reached.
* A [mirror](https://mattwthomas.com/mirrors/) in the US which has effectively infinite
  bandwidth and performs well in most regions (especially the Americas and Europe).


### Debian/Ubuntu distributions

First install our GPG certificate:

```sh
$ wget -qO - https://mirror.mwt.me/ghd/gpgkey | sudo tee /etc/apt/trusted.gpg.d/shiftkey-desktop.asc > /dev/null
```

To setup the package repository, run one of these commands:

```sh
# if you want to use packagecloud.io
$ sudo sh -c 'echo "deb [arch=amd64] https://packagecloud.io/shiftkey/desktop/any/ any main" > /etc/apt/sources.list.d/packagecloud-shiftkey-desktop.list'

# if you want to use the US mirror
$ sudo sh -c 'echo "deb [arch=amd64] https://mirror.mwt.me/ghd/deb/ any main" > /etc/apt/sources.list.d/packagecloud-shiftkey-desktop.list'
```

Then install GitHub Desktop:

```sh
$ sudo apt update && sudo apt install github-desktop
```

### Red Hat/CentOS/Fedora distributions

First install our GPG certificate:

```sh
$ sudo rpm --import https://mirror.mwt.me/ghd/gpgkey
```

To setup the package repository, run one of these commands:

```sh
# if you want to use packagecloud.io
$ sudo sh -c 'echo -e "[shiftkey]\nname=GitHub Desktop\nbaseurl=https://packagecloud.io/shiftkey/desktop/el/7/\$basearch\nenabled=1\ngpgcheck=0\nrepo_gpgcheck=1\ngpgkey=https://mirror.mwt.me/ghd/gpgkey" > /etc/yum.repos.d/shiftkey-desktop.repo'

# if you want to use the US mirror
$ sudo sh -c 'echo -e "[shiftkey]\nname=GitHub Desktop\nbaseurl=https://mirror.mwt.me/ghd/rpm\nenabled=1\ngpgcheck=0\nrepo_gpgcheck=1\ngpgkey=https://mirror.mwt.me/ghd/gpgkey" > /etc/yum.repos.d/shiftkey-desktop.repo'
```

Then install GitHub Desktop:

```sh
# if yum is your package manager
$ sudo yum install github-desktop

# if dnf is your package manager
$ sudo dnf install github-desktop
```

### OpenSUSE distribution


First install our GPG certificate:

```sh
$ sudo rpm --import https://mirror.mwt.me/ghd/gpgkey
```

To setup the package repository, run one of these commands:

```sh
# if you want to use packagecloud.io
$ sudo sh -c 'echo -e "[shiftkey]\nname=GitHub Desktop\nbaseurl=https://packagecloud.io/shiftkey/desktop/el/7/\$basearch\nenabled=1\ngpgcheck=0\nrepo_gpgcheck=1\ngpgkey=https://mirror.mwt.me/ghd/gpgkey" > /etc/zypp/repos.d/shiftkey-desktop.repo'

# if you want to use the US mirror
$ sudo sh -c 'echo -e "[shiftkey]\nname=GitHub Desktop\nbaseurl=https://mirror.mwt.me/ghd/rpm\nenabled=1\ngpgcheck=0\nrepo_gpgcheck=1\ngpgkey=https://mirror.mwt.me/ghd/gpgkey" > /etc/zypp/repos.d/shiftkey-desktop.repo'
```

Then install GitHub Desktop:

```sh
# if zypper is your package manager
$ sudo zypper ref && sudo zypper in github-desktop
```

## Other Distributions

Arch Linux users can install GitHub Desktop from the
[AUR](https://aur.archlinux.org/packages/github-desktop-bin/).

`gnome-keyring` is required and the daemon must be launched either at login or when the X server is started. Normally this is handled by a display manager, but in other cases following the instructions found on the [Arch Wiki](https://wiki.archlinux.org/index.php/GNOME/Keyring#Using_the_keyring_outside_GNOME) will fix the issue of not being able to save login credentials.

GitHub Desktop is also available cross-platform as a [Flatpak](https://github.com/flathub/io.github.shiftey.Desktop) and [AppImage](https://appimage.github.io/GitHubDesktop/).

## Known issues

If you're having troubles with Desktop, please refer to the [Known issues](docs/known-issues.md#linux)
document for guidance and workarounds for common limitations.

## More information

Please check out the [README](https://github.com/desktop/desktop#github-desktop)
on the upstream [GitHub Desktop project](https://github.com/desktop/desktop) and
[desktop.github.com](https://desktop.github.com) for more product-oriented
information about GitHub Desktop.

See our [getting started documentation](https://docs.github.com/en/desktop/overview/getting-started-with-github-desktop) for more information on how to set up, authenticate, and configure GitHub Desktop.

## License

**[MIT](LICENSE)**

The MIT license grant is not for GitHub's trademarks, which include the logo
designs. GitHub reserves all trademark and copyright rights in and to all
GitHub trademarks. GitHub's logos include, for instance, the stylized
Invertocat designs that include "logo" in the file title in the following
folder: [logos](app/static/logos).

GitHub® and its stylized versions and the Invertocat mark are GitHub's
Trademarks or registered Trademarks. When using GitHub's logos, be sure to
follow the GitHub [logo guidelines](https://github.com/logos).
