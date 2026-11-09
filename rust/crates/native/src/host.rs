use crate::{Options, policy::NavigationPolicy};
use anyhow::{Context, Result};
use desktop_bridge::ServerHandle;
use desktop_core::{Registry, Repository};
use std::time::{Duration, Instant};
use tao::{
    dpi::LogicalSize,
    event::{Event, WindowEvent},
    event_loop::{ControlFlow, EventLoopBuilder},
    platform::run_return::EventLoopExtRunReturn,
    window::WindowBuilder,
};
use wry::WebViewBuilder;

#[derive(Clone, Copy)]
enum HostEvent {
    Quit,
    SmokeOk,
    SmokeFailed,
}

pub(super) fn run(options: Options) -> Result<()> {
    // Tao/WebKit must stay on the main thread; Git/HTTP run on Tokio workers.
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()?;
    let registry = Registry::new(match options.config {
        Some(path) => path,
        None => Registry::default_path()?,
    });
    let path = if options.empty {
        None
    } else if options.selected {
        Some(
            registry
                .read()?
                .selected
                .context("no saved repository is selected")?,
        )
    } else {
        options.repo
    };
    let server = runtime.block_on(async {
        let repo = match path {
            Some(path) => Some(Repository::open(&path).await?),
            None => None,
        };
        desktop_bridge::start(repo, registry, 0).await
    })?;
    let result = window_loop(&runtime, &server, options.smoke_test);
    // Close every session and the listener before the async runtime is destroyed.
    let shutdown = runtime.block_on(server.shutdown());
    result?;
    shutdown
}

fn window_loop(
    runtime: &tokio::runtime::Runtime,
    server: &ServerHandle,
    smoke_test: bool,
) -> Result<()> {
    let mut signal =
        runtime.block_on(async { desktop_core::cancellation::ShutdownSignal::new() })?;
    let policy = NavigationPolicy::new(server.session_url())?;
    let mut event_loop = EventLoopBuilder::<HostEvent>::with_user_event().build();
    let window = WindowBuilder::new()
        .with_title("GitHub Desktop — Rust")
        .with_inner_size(LogicalSize::new(1200.0, 800.0))
        .with_min_inner_size(LogicalSize::new(640.0, 480.0))
        .build(&event_loop)?;
    let navigation = policy.clone();
    let new_window = policy.clone();
    let mut builder = WebViewBuilder::new()
        .with_url(server.session_url())
        .with_incognito(true)
        .with_devtools(false)
        .with_navigation_handler(move |url| {
            if navigation.internal(&url) {
                return true;
            }
            if navigation.external(&url) {
                open_external(url);
            }
            false
        })
        .with_new_window_req_handler(move |url, _| {
            if new_window.external(&url) {
                open_external(url);
            }
            wry::NewWindowResponse::Deny
        })
        .with_download_started_handler(|_, _| false);
    if smoke_test {
        let proxy = event_loop.create_proxy();
        builder = builder
            .with_initialization_script(include_str!("smoke.js"))
            .with_ipc_handler(move |request| {
                if !policy.internal(&request.uri().to_string()) {
                    return;
                }
                let event = match request.body().as_str() {
                    "desktop-smoke:ok" => HostEvent::SmokeOk,
                    "desktop-smoke:error" => HostEvent::SmokeFailed,
                    _ => return,
                };
                let _ = proxy.send_event(event);
            });
    }
    #[cfg(target_os = "linux")]
    let _webview = {
        use tao::platform::unix::WindowExtUnix;
        use wry::WebViewBuilderExtUnix;
        let vbox = window
            .default_vbox()
            .context("window has no GTK container")?;
        builder.build_gtk(vbox)?
    };
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    let _webview = builder.build(&window)?;
    let proxy = event_loop.create_proxy();
    let interrupt = runtime.spawn(async move {
        let _ = signal.received().await;
        let _ = proxy.send_event(HostEvent::Quit);
    });
    let deadline = Instant::now() + Duration::from_secs(30);
    let mut passed = false;
    let mut failed = false;
    let code = event_loop.run_return(|event, _, flow| {
        *flow = ControlFlow::WaitUntil(Instant::now() + Duration::from_secs(1));
        match event {
            Event::WindowEvent {
                event: WindowEvent::CloseRequested,
                ..
            }
            | Event::UserEvent(HostEvent::Quit) => *flow = ControlFlow::Exit,
            Event::UserEvent(HostEvent::SmokeOk) => {
                passed = true;
                *flow = ControlFlow::Exit;
            }
            Event::UserEvent(HostEvent::SmokeFailed) => {
                failed = true;
                *flow = ControlFlow::Exit;
            }
            _ => {}
        }
        if server.is_finished() || (smoke_test && Instant::now() >= deadline) {
            failed = true;
            *flow = ControlFlow::Exit;
        }
    });
    interrupt.abort();
    anyhow::ensure!(code == 0, "native event loop exited with code {code}");
    anyhow::ensure!(!failed, "native bridge or webview smoke check failed");
    if smoke_test {
        anyhow::ensure!(passed, "native webview closed before smoke check completed");
        eprintln!("PASS: native webview assets, authenticated WebSocket RPC, and UI mount");
    }
    Ok(())
}

fn open_external(url: String) {
    if open::that_detached(url).is_err() {
        eprintln!("Could not open link in the system browser");
    }
}
