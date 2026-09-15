#include "DesktopNotificationsManager.h"
#include "DesktopNotification.h"
#include "Utils.h"

#include <sstream>
#include <iostream>
#include <wchar.h>
#include <algorithm>
#include <assert.h>
#include <wrl\wrappers\corewrappers.h>

const std::wstring kLaunchAttribute = L"launch";

using namespace ABI::Windows::UI::Notifications;
using namespace Windows::Foundation;
using namespace Wrappers;

DesktopNotification::DesktopNotification(const std::wstring &id,
                                         const std::wstring &appID,
                                         const std::wstring &title,
                                         const std::wstring &body,
                                         const std::wstring &userInfo)
    : m_title(title),
      m_body(body),
      m_userInfo(userInfo),
      m_appID(appID),
      m_id(id)
{
}

// Set the values of each of the text nodes
HRESULT DesktopNotification::setTextValues()
{
    ComPtr<IXmlNodeList> nodeList;
    DN_RETURN_ON_ERROR(
        m_toastXml->GetElementsByTagName(HStringReference(L"text").Get(), &nodeList));
    // create the title
    ComPtr<IXmlNode> textNode;
    DN_RETURN_ON_ERROR(nodeList->Item(0, &textNode));
    DN_RETURN_ON_ERROR(
        setNodeValueString(HStringReference(m_title.c_str()).Get(), textNode.Get()));
    DN_RETURN_ON_ERROR(nodeList->Item(1, &textNode));
    return setNodeValueString(HStringReference(m_body.c_str()).Get(), textNode.Get());
}

HRESULT DesktopNotification::startListeningEvents(DesktopNotificationsManager *desktopNotificationsManager)
{
    ComPtr<IToastNotification> toast = m_notification;

    // TODO: Register the event handlers if we need more control over them. For
    // now, just using the events from the activator is enough.
    // DN_RETURN_ON_ERROR(toast->add_Activated(desktopNotificationsManager, &m_activatedToken));
    // DN_RETURN_ON_ERROR(toast->add_Dismissed(desktopNotificationsManager, &m_dismissedToken));
    // DN_RETURN_ON_ERROR(toast->add_Failed(desktopNotificationsManager, &m_failedToken));

    return S_OK;
}

HRESULT DesktopNotification::setNodeValueString(const HSTRING &inputString, IXmlNode *node)
{
    ComPtr<IXmlText> inputText;
    DN_RETURN_ON_ERROR(m_toastXml->CreateTextNode(inputString, &inputText));

    ComPtr<IXmlNode> inputTextNode;
    DN_RETURN_ON_ERROR(inputText.As(&inputTextNode));

    ComPtr<IXmlNode> pAppendedChild;
    return node->AppendChild(inputTextNode.Get(), &pAppendedChild);
}

HRESULT DesktopNotification::addAttribute(const std::wstring &name, IXmlNamedNodeMap *attributeMap)
{
    ComPtr<ABI::Windows::Data::Xml::Dom::IXmlAttribute> srcAttribute;
    HRESULT hr =
        m_toastXml->CreateAttribute(HStringReference(name.c_str()).Get(), &srcAttribute);

    if (SUCCEEDED(hr))
    {
        ComPtr<IXmlNode> node;
        hr = srcAttribute.As(&node);
        if (SUCCEEDED(hr))
        {
            ComPtr<IXmlNode> pNode;
            hr = attributeMap->SetNamedItem(node.Get(), &pNode);
        }
    }
    return hr;
}

HRESULT DesktopNotification::addAttribute(const std::wstring &name, IXmlNamedNodeMap *attributeMap,
                                          const std::wstring &value)
{
    ComPtr<ABI::Windows::Data::Xml::Dom::IXmlAttribute> srcAttribute;
    DN_RETURN_ON_ERROR(
        m_toastXml->CreateAttribute(HStringReference(name.c_str()).Get(), &srcAttribute));

    ComPtr<IXmlNode> node;
    DN_RETURN_ON_ERROR(srcAttribute.As(&node));

    ComPtr<IXmlNode> pNode;
    DN_RETURN_ON_ERROR(attributeMap->SetNamedItem(node.Get(), &pNode));
    return setNodeValueString(HStringReference(value.c_str()).Get(), node.Get());
}

void DesktopNotification::printXML()
{
    ComPtr<ABI::Windows::Data::Xml::Dom::IXmlNodeSerializer> s;
    ComPtr<ABI::Windows::Data::Xml::Dom::IXmlDocument> ss(m_toastXml);
    ss.As(&s);
    HSTRING string;
    s->GetXml(&string);
    PCWSTR str = WindowsGetStringRawBuffer(string, nullptr);
    DN_LOG_DEBUG(L"------------------------\n\t\t\t" << str << L"\n\t\t" << L"------------------------");
}

// Create and display the toast
HRESULT DesktopNotification::createToast(ComPtr<IToastNotificationManagerStatics> toastManager,
                                         DesktopNotificationsManager *desktopNotificationsManager)
{
    DN_RETURN_ON_ERROR(toastManager->GetTemplateContent(
        ToastTemplateType_ToastImageAndText02, &m_toastXml));
    ComPtr<ABI::Windows::Data::Xml::Dom::IXmlNodeList> rootList;
    DN_RETURN_ON_ERROR(
        m_toastXml->GetElementsByTagName(HStringReference(L"toast").Get(), &rootList));

    ComPtr<IXmlNode> root;
    DN_RETURN_ON_ERROR(rootList->Item(0, &root));
    ComPtr<IXmlNamedNodeMap> rootAttributes;
    DN_RETURN_ON_ERROR(root->get_Attributes(&rootAttributes));

    const auto data = Utils::formatLaunchArgs(m_id, m_userInfo);
    DN_RETURN_ON_ERROR(addAttribute(kLaunchAttribute, rootAttributes.Get(), data));
    DN_RETURN_ON_ERROR(setTextValues());

    // printXML();

    DN_RETURN_ON_ERROR(toastManager->CreateToastNotifierWithId(
        HStringReference(m_appID.c_str()).Get(), &m_notifier));

    ComPtr<IToastNotificationFactory> factory;
    DN_RETURN_ON_ERROR(GetActivationFactory(
        HStringReference(RuntimeClass_Windows_UI_Notifications_ToastNotification).Get(),
        &factory));
    DN_RETURN_ON_ERROR(factory->CreateToastNotification(m_toastXml.Get(), &m_notification));

    ComPtr<IToastNotification2> toastV2;
    if (SUCCEEDED(m_notification.As(&toastV2)))
    {
        DN_RETURN_ON_ERROR(toastV2->put_Tag(HStringReference(m_id.c_str()).Get()));
        DN_RETURN_ON_ERROR(toastV2->put_Group(HStringReference(DN_GROUP_NAME).Get()));
    }

    std::wstring error;
    NotificationSetting setting = NotificationSetting_Enabled;
    if (!DN_CHECK_RESULT(m_notifier->get_Setting(&setting)))
    {
        DN_LOG_ERROR("Failed to retreive NotificationSettings ensure your appId is registered");
    }
    switch (setting)
    {
    case NotificationSetting_Enabled:
        DN_RETURN_ON_ERROR(startListeningEvents(desktopNotificationsManager));
        break;
    case NotificationSetting_DisabledForApplication:
        error = L"DisabledForApplication";
        break;
    case NotificationSetting_DisabledForUser:
        error = L"DisabledForUser";
        break;
    case NotificationSetting_DisabledByGroupPolicy:
        error = L"DisabledByGroupPolicy";
        break;
    case NotificationSetting_DisabledByManifest:
        error = L"DisabledByManifest";
        break;
    }
    if (!error.empty())
    {
        std::wstringstream err;
        err << L"Notifications are disabled\n"
            << L"Reason: " << error << L" Please make sure that the app id is set correctly.\n"
            << L"Command Line: " << GetCommandLineW();
        DN_LOG_ERROR(err.str());
    }
    return m_notifier->Show(m_notification.Get());
}

std::wstring DesktopNotification::getLaunchArgsFromToast(IToastNotification *toast)
{
    IXmlDocument *xmlDoc = nullptr;
    toast->get_Content(&xmlDoc);
    if (xmlDoc == nullptr)
    {
        DN_LOG_ERROR(L"Could not get xml document from toast");
        return L"";
    }

    // Get "launch" attribute and split it to obtain the notification ID
    HSTRING launchArgs;
    IXmlElement *rootElement = nullptr;
    xmlDoc->get_DocumentElement(&rootElement);
    rootElement->GetAttribute(HStringReference(kLaunchAttribute.c_str()).Get(), &launchArgs);

    if (launchArgs == nullptr)
    {
        DN_LOG_ERROR(L"Could not get launch attribute from toast");
        return L"";
    }

    return WindowsGetStringRawBuffer(launchArgs, nullptr);
}

std::string DesktopNotification::getNotificationIDFromToast(IToastNotification *toast)
{
    std::wstring launchArgs = getLaunchArgsFromToast(toast);
    if (launchArgs == L"")
    {
        DN_LOG_ERROR(L"Could not get launch arguments from toast");
        return "";
    }

    return Utils::parseNotificationID(launchArgs);
}

std::wstring DesktopNotification::getUserInfoFromToast(IToastNotification *toast)
{
    std::wstring launchArgs = getLaunchArgsFromToast(toast);
    if (launchArgs == L"")
    {
        DN_LOG_ERROR(L"Could not get launch arguments from toast");
        return L"";
    }

    return Utils::parseUserInfo(launchArgs);
}
