//! Navigation rules shared by both native webview callbacks.
use url::Url;

#[cfg_attr(not(feature = "native"), allow(dead_code))]
#[derive(Clone)]
pub struct NavigationPolicy {
    origin: url::Origin,
}

#[cfg_attr(not(feature = "native"), allow(dead_code))]
impl NavigationPolicy {
    pub fn new(session: &str) -> anyhow::Result<Self> {
        let session = Url::parse(session)?;
        anyhow::ensure!(
            session.scheme() == "http" && session.host_str() == Some("127.0.0.1"),
            "expected loopback session"
        );
        anyhow::ensure!(
            session.port().is_some()
                && session.username().is_empty()
                && session.password().is_none(),
            "expected loopback authority"
        );
        Ok(Self {
            origin: session.origin(),
        })
    }

    /// Only the application document can navigate inside the privileged webview.
    pub fn internal(&self, value: &str) -> bool {
        Url::parse(value).is_ok_and(|url| {
            url.origin() == self.origin
                && url.path() == "/"
                && url.query().is_none()
                && url.username().is_empty()
                && url.password().is_none()
        })
    }

    /// Remote HTTP(S) links open in the system browser, never inside the webview.
    pub fn external(&self, value: &str) -> bool {
        Url::parse(value).is_ok_and(|url| {
            matches!(url.scheme(), "https" | "http")
                && url.host_str().is_some()
                && url.username().is_empty()
                && url.password().is_none()
                && url.origin() != self.origin
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn confines_session_and_filters_external_urls() {
        let policy = NavigationPolicy::new("http://127.0.0.1:9418/#token=secret").unwrap();
        for url in [
            "http://127.0.0.1:9418/",
            "http://127.0.0.1:9418/#token=secret",
        ] {
            assert!(policy.internal(url), "{url}");
            assert!(!policy.external(url), "{url}");
        }
        for url in [
            "https://github.com/owner/repo",
            "http://enterprise.invalid/repo",
        ] {
            assert!(policy.external(url), "{url}");
            assert!(!policy.internal(url), "{url}");
        }
        for url in [
            "javascript:alert(1)",
            "file:///etc/passwd",
            "data:text/html,test",
            "about:blank",
            "https://user:secret@example.com/",
            "http://127.0.0.1:9418/ws",
            "http://127.0.0.1:9418/?bad=1",
        ] {
            assert!(!policy.internal(url), "{url}");
            assert!(!policy.external(url), "{url}");
        }
        for url in [
            "http://127.0.0.1:9419/",
            "http://127.0.0.1:9418.attacker.invalid/",
            "http://127.0.0.1:9418@attacker.invalid/",
        ] {
            assert!(!policy.internal(url), "{url}");
        }
    }
}
