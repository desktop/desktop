#include <node.h>
#include <node_api.h>
#include <nan.h>

#ifdef _WIN32
#include <windows.h>

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

NAN_METHOD(ParseCommandLineArgv) {
  Nan::Utf8String commandLineNan(info[0]);
  std::string commandLine(*commandLineNan, commandLineNan.length());

  // Call split_commandline
  int argc;
  char **argv = split_commandline(commandLine.c_str(), &argc);

  // Create an array of strings from argv
  auto argvArray = Nan::New<v8::Array>(argc);
  for (int i = 0; i < argc; i++) {
    Nan::Set(argvArray, i, Nan::New(argv[i]).ToLocalChecked());
  }

  // Free memory
  for (int i = 0; i < argc; i++) {
    free(argv[i]);
  }
  free(argv);

  info.GetReturnValue().Set(argvArray);
}

#else

NAN_METHOD(ParseCommandLineArgv) {
  napi_value result;
  napi_get_undefined(env, &result);
  napi_throw_error(env, "ENOTSUP", "Not supported on this platform");
  return result;
}

#endif

NAN_MODULE_INIT(Init) {
  Nan::SetMethod(target, "parseCommandLineArgv", ParseCommandLineArgv);
}

NAN_MODULE_WORKER_ENABLED("windows-argv-parser", Init)
