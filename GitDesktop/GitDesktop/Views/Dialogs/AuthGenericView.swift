import SwiftUI

// MARK: - GenericGitAuthenticationView
// Port of `electron/app/src/ui/generic-git-auth/generic-git-auth.tsx`.
// Shown when git reports an authentication failure for a non-interactive
// remote. Data-only `Popup.genericGitAuthentication` carries the remote URL;
// Task 2's DialogHost presents this view and forwards Save/Dismiss to the
// credential flow (`fillCredential`/`approveCredential` in `Git/Auth.swift`).

public struct GenericGitAuthenticationView: View {
    public var remoteURL: String
    /// When non-nil the username is fixed (mirrors the `username?` prop).
    public var fixedUsername: String?
    public var onSave: (String, String) -> Void
    public var onDismiss: () -> Void

    @State private var username: String
    @State private var password: String = ""

    public init(
        remoteURL: String,
        fixedUsername: String? = nil,
        onSave: @escaping (String, String) -> Void = { _, _ in },
        onDismiss: @escaping () -> Void = {}
    ) {
        self.remoteURL = remoteURL
        self.fixedUsername = fixedUsername
        self.onSave = onSave
        self.onDismiss = onDismiss
        self._username = State(initialValue: fixedUsername ?? "")
    }

    private var canSave: Bool {
        !username.isEmpty && !password.isEmpty
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Authentication Failed")
                .font(.headline)
            if let fixedUsername {
                Text("We were unable to authenticate with \(remoteURL). Please enter the password for the user \(fixedUsername) to try again.")
                    .font(.body)
            } else {
                Text("We were unable to authenticate with \(remoteURL). Please enter your username and password to try again.")
                    .font(.body)
            }
            if fixedUsername == nil {
                TextField("Username", text: $username)
                    .textFieldStyle(.roundedBorder)
            }
            SecureField("Password", text: $password)
                .textFieldStyle(.roundedBorder)
            Text("Depending on your repository's hosting service, you might need to use a personal access token as your password.")
                .font(.caption)
                .foregroundStyle(.secondary)
            HStack {
                Spacer()
                Button("Cancel") { onDismiss() }
                    .keyboardShortcut(.cancelAction)
                Button("Save") { onSave(username, password) }
                    .keyboardShortcut(.defaultAction)
                    .disabled(!canSave)
            }
        }
        .padding(20)
        .frame(width: 420)
    }
}

#Preview("Generic auth") {
    GenericGitAuthenticationView(remoteURL: "https://example.com/repo.git")
}

#Preview("Generic auth (fixed user)") {
    GenericGitAuthenticationView(remoteURL: "https://example.com/repo.git", fixedUsername: "ada")
}
