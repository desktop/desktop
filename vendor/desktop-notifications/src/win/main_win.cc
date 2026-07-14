// Windows.h strict mode
#define STRICT

#include <napi.h>
#include "uv.h"

#include <assert.h>
#include <windows.h>

#include <cstdio>
#include <memory>
#include <iostream>

#include "DesktopNotificationsManager.h"
#include "Utils.h"

using namespace Napi;

namespace
{
  Napi::Value initializeNotifications(const Napi::CallbackInfo &info)
  {
    const Napi::Env &env = info.Env();

    if (desktopNotificationsManager)
    {
      return env.Undefined();
    }

    if (info.Length() < 2)
    {
      Napi::TypeError::New(env, "Wrong number of arguments").ThrowAsJavaScriptException();
      return env.Undefined();
    }

    if (!info[0].IsFunction())
    {
      Napi::TypeError::New(env, "Callback must be a function.").ThrowAsJavaScriptException();
      return env.Undefined();
    }

    if (!info[1].IsObject())
    {
      Napi::TypeError::New(env, "An object was expected for the second argument, but wasn't received.").ThrowAsJavaScriptException();
      return env.Undefined();
    }

    auto callback = info[0].As<Napi::Function>();

    Napi::Object options = info[1].As<Napi::Object>();
    if (!options.Has("toastActivatorClsid"))
    {
      Napi::TypeError::New(env, "The options object must have the \"toastActivatorClsid\" property.").ThrowAsJavaScriptException();
      return env.Undefined();
    }

    auto toastActivatorClsid = Utils::utf8ToWideChar(options.Get("toastActivatorClsid").As<Napi::String>());

    desktopNotificationsManager = std::make_shared<DesktopNotificationsManager>(toastActivatorClsid, callback);

    return info.Env().Undefined();
  }

  Napi::Value terminateNotifications(const Napi::CallbackInfo &info)
  {
    desktopNotificationsManager = nullptr;
    return info.Env().Undefined();
  }

  Napi::Value showNotification(const Napi::CallbackInfo &info)
  {
    const Napi::Env &env = info.Env();

    if (!desktopNotificationsManager)
    {
      DN_LOG_ERROR("Cannot show notification: notifications not initialized.");
      return env.Undefined();
    }

    if (info.Length() < 3)
    {
      Napi::TypeError::New(env, "Wrong number of arguments").ThrowAsJavaScriptException();
      return env.Undefined();
    }

    if (!info[0].IsString())
    {
      Napi::TypeError::New(env, "A string was expected for the first argument, but wasn't received.").ThrowAsJavaScriptException();
      return env.Undefined();
    }

    if (!info[1].IsString())
    {
      Napi::TypeError::New(env, "A string was expected for the second argument, but wasn't received.").ThrowAsJavaScriptException();
      return env.Undefined();
    }

    if (!info[2].IsString())
    {
      Napi::TypeError::New(env, "A string was expected for the third argument, but wasn't received.").ThrowAsJavaScriptException();
      return env.Undefined();
    }

    auto id = Utils::utf8ToWideChar(info[0].As<Napi::String>());
    auto title = Utils::utf8ToWideChar(info[1].As<Napi::String>());
    auto body = Utils::utf8ToWideChar(info[2].As<Napi::String>());
    auto userInfo = L"";

    if (info[3].IsObject())
    {
      auto userInfoObject = info[3].As<Napi::Object>();
      auto userInfoString = Utils::JSONStringify(env, userInfoObject);
      userInfo = Utils::utf8ToWideChar(userInfoString);
    }

    desktopNotificationsManager->displayToast(id, title, body, userInfo);

    Napi::Promise::Deferred deferred = Napi::Promise::Deferred::New(env);
    deferred.Resolve(env.Undefined());
    return deferred.Promise();
  }

  Napi::Value closeNotification(const Napi::CallbackInfo &info)
  {
    const Napi::Env &env = info.Env();

    if (!desktopNotificationsManager)
    {
      DN_LOG_ERROR("Cannot close notification: notifications not initialized.");
      return env.Undefined();
    }

    if (info.Length() < 1)
    {
      Napi::TypeError::New(env, "Wrong number of arguments").ThrowAsJavaScriptException();
      return env.Undefined();
    }

    if (!info[0].IsString())
    {
      Napi::TypeError::New(env, "A string was expected for the first argument, but wasn't received.").ThrowAsJavaScriptException();
      return env.Undefined();
    }

    auto id = Utils::utf8ToWideChar(info[0].As<Napi::String>());

    desktopNotificationsManager->closeToast(id);

    return env.Undefined();
  }

  Napi::Value getNotificationsPermission(const Napi::CallbackInfo &info)
  {
    const Napi::Env &env = info.Env();

    Napi::Promise::Deferred deferred = Napi::Promise::Deferred::New(env);

    if (!desktopNotificationsManager)
    {
      DN_LOG_ERROR("Cannot show notification: notifications not initialized.");
      deferred.Resolve(Napi::String::New(env, "default"));
    }
    else
    {
      const std::string permission = desktopNotificationsManager->getCurrentPermission();
      deferred.Resolve(Napi::String::New(env, permission));
    }

    return deferred.Promise();
  }

  Napi::Value requestNotificationsPermission(const Napi::CallbackInfo &info)
  {
    const Napi::Env &env = info.Env();

    // Do nothing. There is no way of requesting permission on Windows.
    Napi::Promise::Deferred deferred = Napi::Promise::Deferred::New(env);
    deferred.Resolve(Napi::Boolean::New(env, true));
    return deferred.Promise();
  }

  Napi::Object Init(Napi::Env env, Napi::Object exports)
  {
    exports.Set(Napi::String::New(env, "initializeNotifications"), Napi::Function::New(env, initializeNotifications));
    exports.Set(Napi::String::New(env, "terminateNotifications"), Napi::Function::New(env, terminateNotifications));
    exports.Set(Napi::String::New(env, "showNotification"), Napi::Function::New(env, showNotification));
    exports.Set(Napi::String::New(env, "closeNotification"), Napi::Function::New(env, closeNotification));
    exports.Set(Napi::String::New(env, "getNotificationsPermission"), Napi::Function::New(env, getNotificationsPermission));
    exports.Set(Napi::String::New(env, "requestNotificationsPermission"), Napi::Function::New(env, requestNotificationsPermission));

    return exports;
  }
}

NODE_API_MODULE(desktopNotificationsNativeModule, Init);
