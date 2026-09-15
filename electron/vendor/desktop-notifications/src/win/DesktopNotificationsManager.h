#pragma once

#include <sdkddkver.h>

// Windows Header Files:
#include <windows.h>
#include <sal.h>
#include <psapi.h>
#include <strsafe.h>
#include <objbase.h>
#include <shobjidl.h>
#include <functiondiscoverykeys.h>
#include <guiddef.h>
#include <shlguid.h>

#include <wrl/client.h>
#include <wrl/implements.h>
#include <windows.ui.notifications.h>

#include <string>
#include <vector>

#include <napi.h>

#include "DesktopNotification.h"

using namespace Microsoft::WRL;
using namespace ABI::Windows::Data::Xml::Dom;

typedef ABI::Windows::Foundation::ITypedEventHandler<
    ABI::Windows::UI::Notifications::ToastNotification *, ::IInspectable *>
    DesktopToastActivatedEventHandler;
typedef ABI::Windows::Foundation::ITypedEventHandler<
    ABI::Windows::UI::Notifications::ToastNotification *,
    ABI::Windows::UI::Notifications::ToastDismissedEventArgs *>
    DesktopToastDismissedEventHandler;
typedef ABI::Windows::Foundation::ITypedEventHandler<
    ABI::Windows::UI::Notifications::ToastNotification *,
    ABI::Windows::UI::Notifications::ToastFailedEventArgs *>
    DesktopToastFailedEventHandler;

class DesktopNotificationsManager : public Microsoft::WRL::Implements<DesktopToastActivatedEventHandler,
                                                                      DesktopToastDismissedEventHandler,
                                                                      DesktopToastFailedEventHandler>
{
    friend class DesktopNotification;

public:
    DesktopNotificationsManager(const std::wstring &toastActivatorClsid,
                                Napi::Function &callback);
    ~DesktopNotificationsManager();

    const std::string getCurrentPermission();

    HRESULT displayToast(const std::wstring &id,
                         const std::wstring &title,
                         const std::wstring &body,
                         const std::wstring &userInfo);
    bool closeToast(const std::wstring &id);

    void handleActivatorEvent(const std::wstring &launchArgs);

    // DesktopToastActivatedEventHandler
    IFACEMETHODIMP Invoke(_In_ ABI::Windows::UI::Notifications::IToastNotification *sender,
                          _In_ IInspectable *args);

    // DesktopToastDismissedEventHandler
    IFACEMETHODIMP Invoke(_In_ ABI::Windows::UI::Notifications::IToastNotification *sender,
                          _In_ ABI::Windows::UI::Notifications::IToastDismissedEventArgs *e);

    // DesktopToastFailedEventHandler
    IFACEMETHODIMP Invoke(_In_ ABI::Windows::UI::Notifications::IToastNotification *sender,
                          _In_ ABI::Windows::UI::Notifications::IToastFailedEventArgs *e);

    // IUnknown
    IFACEMETHODIMP_(ULONG)
    AddRef()
    {
        return InterlockedIncrement(&m_ref);
    }

    IFACEMETHODIMP_(ULONG)
    Release()
    {
        ULONG l = InterlockedDecrement(&m_ref);
        if (l == 0)
        {
            delete this;
        }
        return l;
    }

    IFACEMETHODIMP QueryInterface(_In_ REFIID riid, _COM_Outptr_ void **ppv)
    {
        if (IsEqualIID(riid, IID_IUnknown))
        {
            *ppv = static_cast<IUnknown *>(static_cast<DesktopToastActivatedEventHandler *>(this));
        }
        else if (IsEqualIID(riid, __uuidof(DesktopToastActivatedEventHandler)))
        {
            *ppv = static_cast<DesktopToastActivatedEventHandler *>(this);
        }
        else if (IsEqualIID(riid, __uuidof(DesktopToastDismissedEventHandler)))
        {
            *ppv = static_cast<DesktopToastDismissedEventHandler *>(this);
        }
        else if (IsEqualIID(riid, __uuidof(DesktopToastFailedEventHandler)))
        {
            *ppv = static_cast<DesktopToastFailedEventHandler *>(this);
        }
        else
        {
            *ppv = nullptr;
        }

        if (*ppv)
        {
            reinterpret_cast<IUnknown *>(*ppv)->AddRef();
            return S_OK;
        }

        return E_NOINTERFACE;
    }

private:
    Microsoft::WRL::ComPtr<ABI::Windows::UI::Notifications::IToastNotificationHistory> getHistory();

    Microsoft::WRL::ComPtr<ABI::Windows::UI::Notifications::IToastNotificationManagerStatics> m_toastManager;

    std::vector<std::shared_ptr<DesktopNotification>> m_desktopNotifications;

    void SignalObjectCountZero();
    HRESULT RegisterClassObjects(const std::wstring &toastActivatorClsid);
    HRESULT UnregisterClassObjects();
    bool closeNotification(std::shared_ptr<DesktopNotification> d);
    void invokeJSCallback(const std::string &eventName,
                          const std::string &notificationID,
                          const std::wstring &userInfo);

    // Identifiers of registered class objects. Used for unregistration.
    DWORD m_comCookies[1] = {0};
    const std::wstring m_toastActivatorClsid;
    Napi::ThreadSafeFunction m_callback;
    std::wstring m_appID;
    ULONG m_ref;
};

extern std::shared_ptr<DesktopNotificationsManager> desktopNotificationsManager;
