import AppKit
import SwiftUI

// MARK: - AccessibilityExtras (Task 10)
// VoiceOver labels / live-regions / focus traps + pref plumbing per
// Docs/10-interactions.md §6. Notes:
// - SwiftUI has no `.accessibilityLiveRegion` (verified on the macOS 27 SDK;
//   see Task 4 handoff). Live regions map to `accessibilityAnnouncement(_:)`
//   (NSAccessibility `.announcementRequested`) + `.accessibilityAddTraits(.updatesFrequently)`.
// - Destructive sheets use `.alertDialog` semantics via `AlertDialogModifier`.
// - `underlineLinks` (default true) + `showDiffCheckMarks` (default true) prefs
//   are honored by `AccessibleLink` + diff check-mark opacity (TextDiffView
//   already takes `showCheckMarks`; wire it to Defaults at call sites).
// - Spellcheck honors `commitSpellcheckEnabled` (ChangesStore) + the
//   `NSSpellChecker` menu (standard Edit menu).
// - Zoom uses the key-window magnification + Dynamic Type (no custom theme).

/// Semantic alert-dialog wrapper for destructive sheets (VoiceOver
/// `alertdialog` role ≈ `.isModal` + announcement).
public struct AlertDialogModifier: ViewModifier {
    public var announcement: String?

    public init(announcement: String? = nil) { self.announcement = announcement }

    public func body(content: Content) -> some View {
        content
            .accessibilityAddTraits(.isModal)
            .background(
                Group {
                    if let announcement, !announcement.isEmpty {
                        Color.clear.accessibilityAnnouncement(announcement)
                    }
                })
    }
}

public extension View {
    func alertDialogSemantics(_ announcement: String? = nil) -> some View {
        modifier(AlertDialogModifier(announcement: announcement))
    }
}

/// Focus trap for sheets: keeps Tab cycling inside the sheet content.
/// SwiftUI sheets are already modal; this additionally moves initial focus
/// to the first focusable control and announces the dialog title.
public struct FocusTrapModifier: ViewModifier {
    public var title: String
    @FocusState private var focused: Bool

    public init(title: String) { self.title = title }

    public func body(content: Content) -> some View {
        content
            .focused($focused)
            .onAppear {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
                    focused = true
                }
                AccessibilityAnnouncementModifier.announce(title)
            }
            .accessibilityAddTraits(.isModal)
    }
}

public extension View {
    func focusTrap(_ title: String) -> some View {
        modifier(FocusTrapModifier(title: title))
    }
}

/// Polite live-region container (port of `AriaLiveContainer`): re-announces
/// when `message` changes.
public struct AriaLiveContainer: View {
    public var message: String

    public init(_ message: String) { self.message = message }

    public var body: some View {
        Color.clear
            .frame(width: 0, height: 0)
            .accessibilityHidden(false)
            .accessibilityLabel(message)
            .accessibilityAddTraits(.updatesFrequently)
            .accessibilityAnnouncement(message)
            .id(message)
    }
}

/// Link honoring the `underlineLinks` pref (default true).
public struct AccessibleLink: View {
    public var title: String
    public var action: () -> Void
    @State private var underline: Bool = true

    public init(_ title: String, action: @escaping () -> Void) {
        self.title = title
        self.action = action
    }

    public var body: some View {
        Button(title, action: action)
            .buttonStyle(.link)
            .underline(underline)
            .accessibilityAddTraits(.isLink)
            .onAppear {
                underline = Defaults.bool(Defaults.underlineLinks, default: true)
            }
            .onReceive(NotificationCenter.default.publisher(
                for: UserDefaults.didChangeNotification)) { _ in
                underline = Defaults.bool(Defaults.underlineLinks, default: true)
            }
    }
}

/// Request user attention (dock bounce) when a modal dialog appears while
/// the app is inactive — port of `appIsFocused` + `requestUserAttention`.
public func bounceDockForDialogIfInactive() {
    if !NSApp.isActive {
        NSApp.requestUserAttention(.informationalRequest)
    }
}
