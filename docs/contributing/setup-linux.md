# Setting Up Development Dependencies on Linux

### Fedora 26

First, add the NodeJS package repository for 8.x.

```shellsession
$ curl --silent --location https://rpm.nodesource.com/setup_8.x | sudo bash -
```

After that, install the dependencies to build and test the app:

```shellsession
$ sudo dnf install -y nodejs gcc-c++ make libsecret-devel libXScrnSaver
```

If you want to package Desktop for distribution, you will need these additional dependencies:

```shellsession
$ sudo dnf install fakeroot dpkg rpm rpm-build xz xorriso appstream bzip2-devel
```

If you have problems packaging for AppImage, you may need to force the linker to use the right
version of specific dependencies. More information [here](https://michaelheap.com/error-while-loading-shared-libraries-libbz2-so-1-0-cannot-open-shared-object-file-on-centos-7)
and [here](https://github.com/electron-userland/electron-builder/issues/993#issuecomment-291021974)

```shellsession
$ sudo ln -s `find /usr/lib64/ -type f -name "libbz2.so.1*"` /usr/lib64/libbz2.so.1.0
$ sudo ln -s `find /usr/lib64/ -type f -name "libreadline.so.7.0"` /usr/lib64/libreadline.so.6
```

### Ubuntu 16.04

First, install curl and a GPG program:

```shellsession
$ sudo apt install curl gnupg
```

Then add the NodeJS package repository for 8.x:

```shellsession
$ curl -sL https://deb.nodesource.com/setup_8.x | sudo -E bash -
```

After that, install the dependencies to build and test the app:

```shellsession
$ sudo apt update && sudo apt install -y nodejs gcc make libsecret-1-dev
```

If you want to package Desktop for distribution, install these packages:

```shellsession
$ sudo apt install -y fakeroot dpkg rpm xz-utils xorriso zsync
```
