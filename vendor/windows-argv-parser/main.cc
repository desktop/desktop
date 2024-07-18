#include <node.h>
#include <node_api.h>
#include <assert.h>
#include <stdlib.h>
#include "napi.h"

#ifdef _WIN32
#include <windows.h>

// Based on https://stackoverflow.com/a/28789839
char **split_commandline(const char *cmdline, int *argc)
{
    int i;
    char **argv = NULL;
    assert(argc);

    if (!cmdline)
    {
        return NULL;
    }

    wchar_t **wargs = NULL;
    size_t needed = 0;
    wchar_t *cmdlinew = NULL;
    size_t len = strlen(cmdline) + 1;

    if (!(cmdlinew = (wchar_t *)calloc(len, sizeof(wchar_t))))
        goto fail;

    if (!MultiByteToWideChar(CP_ACP, 0, cmdline, -1, cmdlinew, len))
        goto fail;

    if (!(wargs = CommandLineToArgvW(cmdlinew, argc)))
        goto fail;

    if (!(argv = (char **)calloc(*argc, sizeof(char *))))
        goto fail;

    // Convert from wchar_t * to ANSI char *
    for (i = 0; i < *argc; i++)
    {
        // Get the size needed for the target buffer.
        // CP_ACP = Ansi Codepage.
        needed = WideCharToMultiByte(CP_ACP, 0, wargs[i], -1,
                                    NULL, 0, NULL, NULL);

        if (!(argv[i] = (char *)malloc(needed)))
            goto fail;

        // Do the conversion.
        needed = WideCharToMultiByte(CP_ACP, 0, wargs[i], -1,
                                    argv[i], needed, NULL, NULL);
    }

    if (wargs) LocalFree(wargs);
    if (cmdlinew) free(cmdlinew);
    return argv;

fail:
    if (wargs) LocalFree(wargs);
    if (cmdlinew) free(cmdlinew);

    if (argv)
    {
        for (i = 0; i < *argc; i++)
        {
            if (argv[i])
            {
                free(argv[i]);
            }
        }

        free(argv);
    }

    return NULL;
}

Napi::Value ParseCommandLineArgv(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  std::string commandLine = info[0].As<Napi::String>();

  // Call split_commandline
  int argc;
  char **argv = split_commandline(commandLine.c_str(), &argc);

  // Create an array of strings from argv
  auto argvArray = Napi::Array::New(env, argc);
  for (int i = 0; i < argc; i++) {
    argvArray.Set(i, Napi::String::New(env, argv[i]));
  }

  // Free memory
  for (int i = 0; i < argc; i++) {
    free(argv[i]);
  }
  free(argv);

  return argvArray;
}

#else

Napi::Value ParseCommandLineArgv(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  Napi::TypeError::New(env, "Not supported in this platform").
    ThrowAsJavaScriptException();
  return env.Undefined();
}

#endif

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("parseCommandLineArgv", Napi::Function::New(env, ParseCommandLineArgv));
  return exports;
}

NODE_API_MODULE(windowsArgvParser, Init)
