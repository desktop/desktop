import SwiftUI

// MARK: - SSH auth views
// Ports of `electron/app/src/ui/ssh/add-ssh-host.tsx`,
// `ssh-key-passphrase.tsx`, and `ssh-user-password.tsx`, plus the
// `TrampolineUIHelper` prompt shapes (promise results become `onSubmit`
// callbacks; Task 2's DialogHost bridges them to the SSH askpass flow).
// `Popup.addSSHHost` carries `host` + `fingerprint` only; pass the full
// `SSHHostChallenge` fields here when known.

// MARK: AddSSHHostView

public struct AddSSHHostView: View {
    public var host: String
    public var ip: String
    public var keyType: String
    public var fingerprint: String
    public var onSubmit: (Bool) -> Void
    public var onDismiss: () -> Void

    public init(
        host: String,
        ip: String = "",
        keyType: String = "",
        fingerprint: String,
        onSubmit: @escaping (Bool) -> Void = { _ in },
        onDismiss: @escaping () -> Void = {}
    ) {
        self.host = host
        self.ip = ip
        self.keyType = keyType
        self.fingerprint = fingerprint
        self.onSubmit = onSubmit
        self.onDismiss = onDismiss
    }

    public init(
        challenge: SSHHostChallenge,
        onSubmit: @escaping (Bool) -> Void = { _ in },
        onDismiss: @escaping () -> Void = {}
    ) {
        self.init(
            host: challenge.host, ip: challenge.ip,
            keyType: challenge.keyType, fingerprint: challenge.fingerprint,
            onSubmit: onSubmit, onDismiss: onDismiss)
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("SSH Host")
                .font(.headline)
            if ip.isEmpty {
                Text("The authenticity of host '\(host)' can't be established. \(keyType.isEmpty ? "" : "\(keyType) ")key fingerprint is \(fingerprint).")
            } else {
                Text("The authenticity of host '\(host) (\(ip))' can't be established. \(keyType.isEmpty ? "" : "\(keyType) ")key fingerprint is \(fingerprint).")
            }
            Text("Are you sure you want to continue connecting?")
            HStack {
                Spacer()
                Button("No") {
                    onSubmit(false)
                    onDismiss()
                }
                .keyboardShortcut(.cancelAction)
                Button("Yes") {
                    onSubmit(true)
                    onDismiss()
                }
                .keyboardShortcut(.defaultAction)
            }
        }
        .padding(20)
        .frame(width: 430)
    }
}

// MARK: SSHKeyPassphraseView

public struct SSHKeyPassphraseView: View {
    public var keyPath: String
    public var onSubmit: (String?, Bool) -> Void
    public var onDismiss: () -> Void

    @State private var passphrase: String = ""
    @State private var rememberPassphrase: Bool = false

    public init(
        keyPath: String,
        onSubmit: @escaping (String?, Bool) -> Void = { _, _ in },
        onDismiss: @escaping () -> Void = {}
    ) {
        self.keyPath = keyPath
        self.onSubmit = onSubmit
        self.onDismiss = onDismiss
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("SSH Key Passphrase")
                .font(.headline)
            SecureField("Enter passphrase for key '\(keyPath)':", text: $passphrase)
                .textFieldStyle(.roundedBorder)
            Toggle("Remember passphrase", isOn: $rememberPassphrase)
            HStack {
                Spacer()
                Button("Cancel") {
                    onSubmit(nil, false)
                    onDismiss()
                }
                .keyboardShortcut(.cancelAction)
                Button("OK") {
                    onSubmit(passphrase, rememberPassphrase)
                    onDismiss()
                }
                .keyboardShortcut(.defaultAction)
                .disabled(passphrase.isEmpty)
            }
        }
        .padding(20)
        .frame(width: 400)
    }
}

// MARK: SSHUserPasswordView

public struct SSHUserPasswordView: View {
    public var username: String
    public var onSubmit: (String?, Bool) -> Void
    public var onDismiss: () -> Void

    @State private var password: String = ""
    @State private var rememberPassword: Bool = false

    public init(
        username: String,
        onSubmit: @escaping (String?, Bool) -> Void = { _, _ in },
        onDismiss: @escaping () -> Void = {}
    ) {
        self.username = username
        self.onSubmit = onSubmit
        self.onDismiss = onDismiss
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("SSH User Password")
                .font(.headline)
            SecureField("Enter password for '\(username)':", text: $password)
                .textFieldStyle(.roundedBorder)
            Toggle("Remember password", isOn: $rememberPassword)
            HStack {
                Spacer()
                Button("Cancel") {
                    onSubmit(nil, false)
                    onDismiss()
                }
                .keyboardShortcut(.cancelAction)
                Button("OK") {
                    onSubmit(password, rememberPassword)
                    onDismiss()
                }
                .keyboardShortcut(.defaultAction)
                .disabled(password.isEmpty)
            }
        }
        .padding(20)
        .frame(width: 400)
    }
}

#Preview("SSH sheets") {
    VStack(spacing: 16) {
        AddSSHHostView(host: "example.com", ip: "93.184.216.34", keyType: "ED25519", fingerprint: "SHA256:abc123")
        SSHKeyPassphraseView(keyPath: "/Users/ada/.ssh/id_ed25519")
        SSHUserPasswordView(username: "git")
    }
    .padding()
}
