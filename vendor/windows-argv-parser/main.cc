#include <node.h>
#include <node_api.h>
#include <nan.h>
#include <assert.h>
#include <stdlib.h>
#include "napi.h"

using node::AddEnvironmentCleanupHook;
using v8::HandleScope;
using v8::Isolate;
using v8::Local;
using v8::Object;

// #ifdef _WIN32
// #include <windows.h>

// char **split_commandline(const char *cmdline, int *argc)
// {
//     int i;
//     char **argv = NULL;
//     assert(argc);

//     if (!cmdline)
//     {
//         return NULL;
//     }

//     wchar_t **wargs = NULL;
//     size_t needed = 0;
//     wchar_t *cmdlinew = NULL;
//     size_t len = strlen(cmdline) + 1;

//     if (!(cmdlinew = (wchar_t *)calloc(len, sizeof(wchar_t))))
//         goto fail;

//     if (!MultiByteToWideChar(CP_ACP, 0, cmdline, -1, cmdlinew, len))
//         goto fail;

//     if (!(wargs = CommandLineToArgvW(cmdlinew, argc)))
//         goto fail;

//     if (!(argv = (char **)calloc(*argc, sizeof(char *))))
//         goto fail;

//     // Convert from wchar_t * to ANSI char *
//     for (i = 0; i < *argc; i++)
//     {
//         // Get the size needed for the target buffer.
//         // CP_ACP = Ansi Codepage.
//         needed = WideCharToMultiByte(CP_ACP, 0, wargs[i], -1,
//                                     NULL, 0, NULL, NULL);

//         if (!(argv[i] = (char *)malloc(needed)))
//             goto fail;

//         // Do the conversion.
//         needed = WideCharToMultiByte(CP_ACP, 0, wargs[i], -1,
//                                     argv[i], needed, NULL, NULL);
//     }

//     if (wargs) LocalFree(wargs);
//     if (cmdlinew) free(cmdlinew);
//     return argv;

// fail:
//     if (wargs) LocalFree(wargs);
//     if (cmdlinew) free(cmdlinew);

//     if (argv)
//     {
//         for (i = 0; i < *argc; i++)
//         {
//             if (argv[i])
//             {
//                 free(argv[i]);
//             }
//         }

//         free(argv);
//     }

//     return NULL;
// }

// NAN_METHOD(ParseCommandLineArgv) {
//   Nan::Utf8String commandLineNan(info[0]);
//   std::string commandLine(*commandLineNan, commandLineNan.length());

//   // Call split_commandline
//   int argc;
//   char **argv = split_commandline(commandLine.c_str(), &argc);

//   // Create an array of strings from argv
//   auto argvArray = Nan::New<v8::Array>(argc);
//   for (int i = 0; i < argc; i++) {
//     Nan::Set(argvArray, i, Nan::New(argv[i]).ToLocalChecked());
//   }

//   // Free memory
//   for (int i = 0; i < argc; i++) {
//     free(argv[i]);
//   }
//   free(argv);

//   info.GetReturnValue().Set(argvArray);
// }

// #else

Napi::Value ParseCommandLineArgv(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

    Napi::TypeError::New(env, "Not supported in this platform").
      ThrowAsJavaScriptException();
    return env.Undefined();
}

// #endif

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("parseCommandLineArgv", Napi::Function::New(env, ParseCommandLineArgv));
  return exports;
}

NODE_API_MODULE(windowsArgvParser, Init)
