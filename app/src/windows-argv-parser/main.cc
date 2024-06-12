#include <node.h>
#include <node_api.h>

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

napi_value ParseCommandLineArgv(napi_env env, napi_callback_info info) {
  napi_value params[1];
  napi_get_cb_info(env, info, NULL, params, NULL, NULL);

  // Convert napi_string to char *
  size_t length;
  napi_get_value_string_utf8(env, params[0], nullptr, 0, &length);
  char *commandLineStr = new char[length + 1];
  napi_get_value_string_utf8(env, params[0], commandLineStr, length + 1, &length);

  // Call split_commandline
  int argc;
  char **argv = split_commandline(commandLineStr, &argc);

  // Create an array of strings
  napi_value argvArray;
  napi_create_array(env, &argvArray);
  for (int i = 0; i < argc; i++) {
    napi_value arg;
    napi_create_string_utf8(env, argv[i], NAPI_AUTO_LENGTH, &arg);
    napi_set_element(env, argvArray, i, arg);
  }

  // Free memory
  for (int i = 0; i < argc; i++) {
    free(argv[i]);
  }
  free(argv);
  delete[] commandLineStr;

  return argvArray;
}

#else

napi_value ParseCommandLineArgv(napi_env env, napi_callback_info info) {
  napi_value result;
  napi_get_undefined(env, &result);
  napi_throw_error(env, "ENOTSUP", "Not supported on this platform");
  return result;
}

#endif

napi_value Init(napi_env env, napi_value exports) {
  napi_status status;
  napi_value fn;

  status = napi_create_function(env, nullptr, 0, ParseCommandLineArgv, nullptr, &fn);
  if (status != napi_ok) return nullptr;

  status = napi_set_named_property(env, exports, "parseCommandLineArgv", fn);
  if (status != napi_ok) return nullptr;

  return exports;
}

NODE_MODULE(windowsArgvParserNativeModule, Init);

