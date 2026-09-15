#pragma once
#include "DesktopNotificationsManager.h"
#include <iostream>

class DesktopNotificationsManager;

class DesktopNotification
{

public:
    explicit DesktopNotification(const std::wstring &id,
                                 const std::wstring &appID,
                                 const std::wstring &title,
                                 const std::wstring &body,
                                 const std::wstring &userInfo);

    std::wstring getID()
    {
        return m_id;
    }

    // Create and display the toast
    HRESULT createToast(Microsoft::WRL::ComPtr<ABI::Windows::UI::Notifications::IToastNotificationManagerStatics> toastManager,
                        DesktopNotificationsManager *desktopNotificationsManager);

    static std::string getNotificationIDFromToast(ABI::Windows::UI::Notifications::IToastNotification *toast);
    static std::wstring getUserInfoFromToast(ABI::Windows::UI::Notifications::IToastNotification *toast);

private:
    std::wstring m_appID;

    std::wstring m_title;
    std::wstring m_body;
    std::wstring m_userInfo;
    std::wstring m_id;
    EventRegistrationToken m_activatedToken, m_dismissedToken, m_failedToken;

    Microsoft::WRL::ComPtr<ABI::Windows::Data::Xml::Dom::IXmlDocument> m_toastXml;
    Microsoft::WRL::ComPtr<ABI::Windows::UI::Notifications::IToastNotifier> m_notifier;
    Microsoft::WRL::ComPtr<ABI::Windows::UI::Notifications::IToastNotification> m_notification;

    // Set the values of each of the text nodes
    HRESULT setTextValues();
    HRESULT startListeningEvents(DesktopNotificationsManager *desktopNotificationsManager);
    HRESULT setNodeValueString(const HSTRING &inputString, ABI::Windows::Data::Xml::Dom::IXmlNode *node);
    HRESULT addAttribute(const std::wstring &name, ABI::Windows::Data::Xml::Dom::IXmlNamedNodeMap *attributeMap);
    HRESULT addAttribute(const std::wstring &name, ABI::Windows::Data::Xml::Dom::IXmlNamedNodeMap *attributeMap,
                         const std::wstring &value);
    void printXML();

    static std::wstring getLaunchArgsFromToast(ABI::Windows::UI::Notifications::IToastNotification *toast);
};
