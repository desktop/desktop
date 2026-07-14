#pragma once

#include <algorithm>
#include <ntverp.h>
#include <sstream>
#include <wrl.h>

#include "DesktopNotificationsManager.h"
#include "Utils.h"

#define DN_WSTRINGIFY(X) L##X
#define DN_STRINGIFY(X) DN_WSTRINGIFY(X)

typedef struct NOTIFICATION_USER_INPUT_DATA
{
    LPCWSTR Key;
    LPCWSTR Value;
} NOTIFICATION_USER_INPUT_DATA;

MIDL_INTERFACE("53E31837-6600-4A81-9395-75CFFE746F94")
INotificationActivationCallback : public IUnknown
{
public:
    virtual HRESULT STDMETHODCALLTYPE Activate(
        __RPC__in_string LPCWSTR appUserModelId, __RPC__in_opt_string LPCWSTR invokedArgs,
        __RPC__in_ecount_full_opt(count) const NOTIFICATION_USER_INPUT_DATA *data,
        ULONG count) = 0;
};

// The COM server which implements the callback notifcation from Action Center
class DesktopNotificationsActionCenterActivator
    : public Microsoft::WRL::RuntimeClass<
          Microsoft::WRL::RuntimeClassFlags<Microsoft::WRL::ClassicCom>,
          INotificationActivationCallback>
{
public:
    DesktopNotificationsActionCenterActivator() {}
    virtual HRESULT STDMETHODCALLTYPE Activate(__RPC__in_string LPCWSTR appUserModelId,
                                               __RPC__in_opt_string LPCWSTR invokedArgs,
                                               __RPC__in_ecount_full_opt(count)
                                                   const NOTIFICATION_USER_INPUT_DATA *data,
                                               ULONG count) override
    {
        if (!desktopNotificationsManager)
        {
            DN_LOG_ERROR("Cannot handle notification activator: notifications not initialized.");
            return S_OK;
        }

        desktopNotificationsManager->handleActivatorEvent(invokedArgs);

        return S_OK;
    }
};
