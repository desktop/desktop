#include "Utils.h"
#include "DesktopNotificationsManager.h"

#include <wrl/client.h>
#include <wrl/implements.h>
#include <wrl/module.h>
#include <iostream>

using namespace Microsoft::WRL;

namespace Utils
{
    LPWSTR Utils::utf8ToWideChar(std::string utf8)
    {
        int wide_char_length = MultiByteToWideChar(CP_UTF8,
                                                   0,
                                                   utf8.c_str(),
                                                   -1,
                                                   nullptr,
                                                   0);
        if (wide_char_length == 0)
        {
            return nullptr;
        }

        LPWSTR result = new WCHAR[wide_char_length];
        if (MultiByteToWideChar(CP_UTF8,
                                0,
                                utf8.c_str(),
                                -1,
                                result,
                                wide_char_length) == 0)
        {
            delete[] result;
            return nullptr;
        }

        return result;
    }

    std::string Utils::wideCharToUTF8(std::wstring wstr)
    {
        if (wstr.empty())
        {
            return std::string();
        }
        int size_needed = WideCharToMultiByte(CP_UTF8, 0, &wstr[0], (int)wstr.size(), NULL, 0, NULL, NULL);
        std::string strTo(size_needed, 0);
        WideCharToMultiByte(CP_UTF8, 0, &wstr[0], (int)wstr.size(), &strTo[0], size_needed, NULL, NULL);
        return strTo;
    }

    std::unordered_map<std::wstring, std::wstring> splitData(const std::wstring &data)
    {
        std::unordered_map<std::wstring, std::wstring> out;
        size_t start = 0;
        for (size_t end = data.find(L";", start); end != std::wstring::npos;
             start = end + 1, end = data.find(L";", start))
        {
            if (start == end)
            {
                end = data.size();
            }
            const std::wstring tmp(data.data() + start, end - start);
            const auto pos = tmp.find(L"=");
            if (pos > 0)
            {
                out[tmp.substr(0, pos)] = tmp.substr(pos + 1);
            }
        }
        return out;
    }

    std::wstring formatLaunchArgs(const std::wstring &notificationID, const std::wstring &userInfo)
    {
        std::wstringstream out;
        out << notificationID << L";" << userInfo;
        return out.str();
    }

    std::string parseNotificationID(const std::wstring &launchArgs)
    {
        std::wstringstream out;
        size_t end = launchArgs.find(L";");
        if (end == std::wstring::npos)
        {
            return "";
        }

        return wideCharToUTF8(launchArgs.substr(0, end));
    }

    std::wstring parseUserInfo(const std::wstring &launchArgs)
    {
        std::wstringstream out;
        size_t start = launchArgs.find(L";");
        if (start == std::wstring::npos)
        {
            return L"";
        }

        return launchArgs.substr(start + 1);
    }

    std::wstring formatWinError(unsigned long errorCode)
    {
        wchar_t *error = nullptr;
        size_t len = FormatMessage(FORMAT_MESSAGE_ALLOCATE_BUFFER | FORMAT_MESSAGE_FROM_SYSTEM | FORMAT_MESSAGE_IGNORE_INSERTS,
                                   nullptr, errorCode, MAKELANGID(LANG_NEUTRAL, SUBLANG_DEFAULT),
                                   reinterpret_cast<LPWSTR>(&error), 0, nullptr);
        const auto out = std::wstring(error, len);
        LocalFree(error);
        return out;
    }

    Napi::String JSONStringify(const Napi::Env &env, const Napi::Object &object)
    {
        Napi::Object json = env.Global().Get("JSON").As<Napi::Object>();
        Napi::Function stringify = json.Get("stringify").As<Napi::Function>();
        Napi::String result = Napi::String::New(env, "");

        try
        {
            result = stringify.Call(json, {object}).As<Napi::String>();
        }
        catch (...)
        {
            DN_LOG_ERROR("Failed to stringify JSON object");
        }

        return result;
    }

    Napi::Value JSONParse(const Napi::Env &env, const Napi::String &string)
    {
        Napi::Object json = env.Global().Get("JSON").As<Napi::Object>();
        Napi::Function parse = json.Get("parse").As<Napi::Function>();
        Napi::Value result = env.Undefined();

        try
        {
            result = parse.Call(json, {string}).As<Napi::Object>();
        }
        catch (...)
        {
            DN_LOG_ERROR("Failed to parse JSON");
        }

        return result;
    }
}
