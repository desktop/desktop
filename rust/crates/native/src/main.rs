use clap::Parser;
use std::path::PathBuf;

#[cfg(all(
    feature = "native",
    any(target_os = "linux", target_os = "macos", target_os = "windows")
))]
mod host;
#[cfg(any(
    test,
    all(
        feature = "native",
        any(target_os = "linux", target_os = "macos", target_os = "windows")
    )
))]
mod policy;

/// Optional desktop shell for the same loopback application used in Termux.
#[derive(Parser)]
#[command(version, about)]
struct Options {
    #[arg(short = 'C', long, conflicts_with_all = ["empty", "selected"])]
    repo: Option<PathBuf>,
    #[arg(long, conflicts_with = "selected")]
    empty: bool,
    #[arg(long)]
    selected: bool,
    #[arg(long)]
    config: Option<PathBuf>,
    #[arg(long, hide = true)]
    smoke_test: bool,
}

fn main() -> anyhow::Result<()> {
    // Credential-helper children share this executable and never initialize UI.
    let mut arguments = std::env::args_os().skip(1);
    if arguments.next().as_deref() == Some(std::ffi::OsStr::new("__credential-helper")) {
        let operation = arguments
            .next()
            .and_then(|value| value.into_string().ok())
            .unwrap_or_default();
        return tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()?
            .block_on(desktop_core::git_credential_helper(&operation));
    }
    let options = Options::parse();
    #[cfg(all(
        feature = "native",
        any(target_os = "linux", target_os = "macos", target_os = "windows")
    ))]
    {
        host::run(options)
    }
    #[cfg(not(all(
        feature = "native",
        any(target_os = "linux", target_os = "macos", target_os = "windows")
    )))]
    {
        let _ = options;
        anyhow::bail!(
            "native hosting requires --features native on Linux, macOS, or Windows; on Termux use desktop-rs serve --empty"
        )
    }
}
