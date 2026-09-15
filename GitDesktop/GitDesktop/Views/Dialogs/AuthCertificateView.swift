import SwiftUI

// MARK: - UntrustedCertificateView
// Port of `electron/app/src/ui/untrusted-certificate/untrusted-certificate.tsx`
// (generic-git wording; the reference's GitHub Enterprise copy is pruned per
// scope). Presented for `Popup.untrustedCertificate(host:certificateData:)`.

public struct UntrustedCertificateView: View {
    public var host: String
    public var certificateData: String
    public var onContinue: () -> Void
    public var onDismiss: () -> Void

    public init(
        host: String,
        certificateData: String = "",
        onContinue: @escaping () -> Void = {},
        onDismiss: @escaping () -> Void = {}
    ) {
        self.host = host
        self.certificateData = certificateData
        self.onContinue = onContinue
        self.onDismiss = onDismiss
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Untrusted Server")
                .font(.headline)
            Text("GitDesktop cannot verify the identity of \(host). The certificate (\(certificateData)) is invalid or untrusted. This may indicate attackers are trying to steal your data.")
                .font(.body)
            Text("If you are unsure of what to do, cancel and contact your system administrator.")
                .font(.body)
            HStack {
                Spacer()
                Button("Cancel") { onDismiss() }
                    .keyboardShortcut(.cancelAction)
                Button("Continue") { onContinue() }
                    .keyboardShortcut(.defaultAction)
            }
        }
        .padding(20)
        .frame(width: 440)
    }
}

#Preview("Untrusted certificate") {
    UntrustedCertificateView(host: "git.example.com", certificateData: "CN=git.example.com")
}
