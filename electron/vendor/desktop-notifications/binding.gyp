{
  'targets': [
    {
      'target_name': 'desktop-notifications',
      'cflags!': [ '-fno-exceptions' ],
      'cflags_cc!': [ '-fno-exceptions' ],
      'msvs_settings': {
        'VCCLCompilerTool': { 'ExceptionHandling': 1 },
      },
      'include_dirs': [
        '<!(node -p "require(\'node-addon-api\').include_dir")' ],
      'defines': [
        "NAPI_VERSION=<(napi_build_version)",
      ],
      'xcode_settings': {
        'GCC_ENABLE_CPP_EXCEPTIONS': 'YES',
        'CLANG_CXX_LIBRARY': 'libc++',
        'MACOSX_DEPLOYMENT_TARGET': '10.13',
      },
      'conditions': [
        ['OS=="win"', {
          "defines": [
            "UNICODE",
          ],
          'sources': [
            'src/win/main_win.cc',
            'src/win/DesktopNotificationsManager.cpp',
            'src/win/DesktopNotification.cpp',
            'src/win/Utils.cpp'
          ],
          "libraries": [
            "runtimeobject.lib"
          ],
          'msvs_disabled_warnings': [
            4267,  # conversion from 'size_t' to 'int', possible loss of data
            4530,  # C++ exception handler used, but unwind semantics are not enabled
            4506,  # no definition for inline function
          ],
        }],
        ['OS=="mac"', {
          'sources': [
            'src/mac/main_mac.mm',
            'src/mac/GHDesktopNotificationsManager.m',
            'src/mac/Utils.m',
          ],
          'xcode_settings': {
              'OTHER_CFLAGS': [
                  '-fobjc-arc',
              ],
          },
          'libraries': [
            '$(SDKROOT)/System/Library/Frameworks/UserNotifications.framework',
          ],
        }],
      ],
    }
  ]
}
