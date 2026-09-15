import AppKit
import SwiftUI

// MARK: - Accessibility
// SwiftUI has no live-region modifier, so `AriaLiveContainer`
// (Docs/03-design-system.md) maps to announcements posted through
// `NSAccessibility`. Views re-announce on appear; hosts key rows by content
// (`\.id`) so replacements re-announce. The full VoiceOver/focus-trap audit
// lands in Task 10.

struct AccessibilityAnnouncementModifier: ViewModifier {
    var message: String

    func body(content: Content) -> some View {
        content.onAppear { Self.announce(message) }
    }

    static func announce(_ message: String) {
        let trimmed = message.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        NSAccessibility.post(
            element: NSApp as AnyObject,
            notification: .announcementRequested,
            userInfo: [
                .announcement: trimmed,
                .priority: NSAccessibilityPriorityLevel.high.rawValue,
            ])
    }
}

extension View {
    /// Announce `message` to VoiceOver when this view appears.
    func accessibilityAnnouncement(_ message: String) -> some View {
        modifier(AccessibilityAnnouncementModifier(message: message))
    }
}
