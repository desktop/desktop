  {
    'target_defaults': {
        'defines': [
          "NAPI_VERSION=<(napi_build_version)",
        ],
        'include_dirs': [
          '<!(node -p "require(\'node-addon-api\').include_dir")',
          'include'
        ],
        'xcode_settings': {
          'OTHER_CFLAGS': [
            '-Wall',
            '-Werror',
            '-Werror=format-security',
            '-fPIC',
            '-D_FORTIFY_SOURCE=1',
            '-fstack-protector-strong'
          ]
        },
        'cflags': [
          '-Wall',
          '-Werror',
          '-fPIC',
          '-pie',
          '-D_FORTIFY_SOURCE=1',
          '-fstack-protector-strong',
          '-Werror=format-security',
        ],
        'cflags!': [ '-fno-exceptions' ],
        'cflags_cc!': [ '-fno-exceptions' ],
        'ldflags': [
          '-z relro',
          '-z now'
        ],
        'msvs_settings': {
          'VCCLCompilerTool': { 'ExceptionHandling': 1 },
        },
        'conditions': [
          ['OS=="win"', { 'defines': [ 'WINDOWS' ] }]
        ]
    },
    'targets': [
      {
        'target_name': 'desktop-askpass-trampoline',
        'type': 'executable',
        'sources': [
          'src/desktop-trampoline.c',
          'src/socket.c'
        ],
        'conditions': [
          ['OS=="win"', {
            'link_settings': {
              'libraries': [ 'Ws2_32.lib' ]
            }
          }]
        ]
      },
      {
        'target_name': 'desktop-credential-helper-trampoline',
        'type': 'executable',
        'defines': [
          'CREDENTIAL_HELPER'
        ],
        'sources': [
          'src/desktop-trampoline.c',
          'src/socket.c'
        ],
        'conditions': [
          ['OS=="win"', {
            'link_settings': {
              'libraries': [ 'Ws2_32.lib' ]
            }
          }]
        ]
      },
      {
        'target_name': 'ssh-wrapper',
        'type': 'executable',
        'sources': [
          'src/ssh-wrapper.c'
        ],
      },
    ],
  }
