// kms-native — Secure Rust native runtime for Kaiser's Meeting Space.
//
// Entry point with startup handshake, version/capabilities,
// structured logging to stderr, graceful shutdown.
//
// This is a supervised sidecar process — it reads IPC requests from stdin
// and writes responses/events to stdout. It does NOT own UI, network,
// cloud identity, provider credentials, or meeting business state.

mod protocol;
mod runtime;
mod storage;
mod simulator;
mod capture;
mod local_speech;

use runtime::{Runtime, RuntimeConfig};

#[tokio::main]
async fn main() {
    // Structured log start
    eprintln!(
        "[kms-native] [{}] Starting v{} (protocol v{})",
        chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
        env!("CARGO_PKG_VERSION"),
        protocol::PROTOCOL_VERSION,
    );

    let config = RuntimeConfig::from_env();

    let runtime = Runtime::new(config);

    if let Err(e) = runtime.run().await {
        eprintln!("[kms-native] Fatal error: {}", e);
        std::process::exit(1);
    }
}
