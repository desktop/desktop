#pragma once

#include <comdef.h>
#include <sstream>
#include <unordered_map>
#include <iostream>
#include <napi.h>

#define DN_LOG(stream, level, msg) stream << L"[desktop-notifications] [" << level << L"] " << msg << std::endl

#define DN_LOG_VERBOSE(msg) DN_LOG(std::wcout, "verbose", msg)
#define DN_LOG_INFO(msg) DN_LOG(std::wcout, "info", msg)
#define DN_LOG_DEBUG(msg) DN_LOG(std::wcout, "debug", msg)
#define DN_LOG_WARN(msg) DN_LOG(std::wcout, "warning", msg)
#define DN_LOG_ERROR(msg) DN_LOG(std::wcerr, "error", msg)

namespace Utils
{
    LPWSTR utf8ToWideChar(std::string utf8);
    std::string wideCharToUTF8(std::wstring wstr);

    std::unordered_map<std::wstring, std::wstring> splitData(const std::wstring &data);

    // Formats the launch args like this: <notificationID>;<userInfo JSON string>
    std::wstring formatLaunchArgs(const std::wstring &notificationID, const std::wstring &userInfo);
    std::string parseNotificationID(const std::wstring &launchArgs);
    std::wstring parseUserInfo(const std::wstring &launchArgs);

    inline bool checkResult(const char *file, const long line, const char *func, const HRESULT &hr)
    {
        if (FAILED(hr))
        {
            DN_LOG_ERROR(file << line << func << L":\n\t\t\t" << hr);
            return false;
        }
        return true;
    }

    std::wstring formatWinError(unsigned long errorCode);

    Napi::String JSONStringify(const Napi::Env &env, const Napi::Object &object);
    Napi::Value JSONParse(const Napi::Env &env, const Napi::String &string);
};

#define DN_GROUP_NAME L"desktop-notifications"

#define DN_CHECK_RESULT(hr) Utils::checkResult(__FILE__, __LINE__, __FUNCSIG__, hr)

#define DN_RETURN_ON_ERROR(hr)      \
    do                              \
    {                               \
        HRESULT _tmp = hr;          \
        if (!DN_CHECK_RESULT(_tmp)) \
        {                           \
            return _tmp;            \
        }                           \
    } while (false)
