use std::fs::OpenOptions;
use std::io::{self, Write};
use std::path::PathBuf;
use std::sync::Mutex;

// Custom writer that writes to both file and stderr
struct DualWriter {
    file: Mutex<std::fs::File>,
}

impl Write for DualWriter {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        let mut file = self.file.lock().unwrap();
        // Write to file
        file.write_all(buf)?;
        // Also write to stderr
        io::stderr().write_all(buf)?;
        Ok(buf.len())
    }

    fn flush(&mut self) -> io::Result<()> {
        let mut file = self.file.lock().unwrap();
        file.flush()?;
        io::stderr().flush()?;
        Ok(())
    }
}

/// Initialize logger to write to both file and stderr
/// Logs are written to a "logs" directory next to the executable:
/// - Development: ./logs/codestudio-YYYYMMDD.log (relative to current directory)
/// - Production: <exe_dir>/logs/codestudio-YYYYMMDD.log (next to the .exe file)
pub fn init_logger() {
    // Get log directory - prefer exe directory in production, current directory in dev
    let log_dir = if cfg!(debug_assertions) {
        // Development mode: use current directory
        std::env::current_dir()
            .unwrap_or_else(|_| PathBuf::from("."))
            .join("logs")
    } else {
        // Production mode: use exe directory
        std::env::current_exe()
            .ok()
            .and_then(|exe_path| exe_path.parent().map(|p| p.to_path_buf()))
            .map(|exe_dir| exe_dir.join("logs"))
            .unwrap_or_else(|| {
                // Fallback to current directory if we can't determine exe path
                std::env::current_dir()
                    .unwrap_or_else(|_| PathBuf::from("."))
                    .join("logs")
            })
    };

    // Create log directory if it doesn't exist
    if let Err(e) = std::fs::create_dir_all(&log_dir) {
        eprintln!("Failed to create log directory {:?}: {}", log_dir, e);
        // Fallback to stderr only
        env_logger::Builder::from_default_env()
            .filter_level(log::LevelFilter::Warn) // Default to warn level to capture all errors and warnings
            .init();
        return;
    }

    // Clean up old log files (keep last 30 days)
    cleanup_old_logs(&log_dir);

    // Create log file path with timestamp
    let timestamp = chrono::Local::now().format("%Y%m%d");
    let log_file = log_dir.join(format!("codestudio-{}.log", timestamp));

    // Open log file for appending
    let file = match OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_file)
    {
        Ok(f) => f,
        Err(e) => {
            eprintln!("Failed to open log file {:?}: {}", log_file, e);
            // Fallback to stderr only
            env_logger::Builder::from_default_env()
                .filter_level(log::LevelFilter::Warn) // Default to warn level to capture all errors and warnings
                .init();
            return;
        }
    };

    // Create dual writer that writes to both file and stderr
    let dual_writer = DualWriter {
        file: Mutex::new(file),
    };

    // Configure logger to write to both file and stderr
    // Default to Info level for Claude-related modules to capture all important logs
    // Can be overridden by RUST_LOG environment variable
    let mut builder = env_logger::Builder::from_default_env();
    
    // If RUST_LOG is not set, use Info level for Claude modules and Warn for others
    if std::env::var("RUST_LOG").is_err() {
        builder.filter_level(log::LevelFilter::Warn); // Default for all modules
        // Set Info level for Claude-related modules to capture all important logs
        builder.filter_module("codestudio::commands::claude", log::LevelFilter::Info);
        builder.filter_module("codestudio::commands::agents", log::LevelFilter::Info);
        builder.filter_module("codestudio::claude_binary", log::LevelFilter::Info);
        builder.filter_module("codestudio::process", log::LevelFilter::Info);
    }
    
    builder
        .target(env_logger::Target::Pipe(Box::new(dual_writer)))
        .format(|buf, record| {
            use std::io::Write;
            let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S%.3f");
            let module_path = record.module_path().unwrap_or("unknown");
            let file_path = record.file().unwrap_or("unknown");
            let line = record.line().map(|l| l.to_string()).unwrap_or_else(|| "?".to_string());
            
            // Detect Claude-related logs more comprehensively
            let args_str = record.args().to_string();
            let is_claude_related = module_path.contains("claude") 
                || module_path.contains("Claude")
                || args_str.contains("Claude")
                || args_str.contains("claude")
                || args_str.contains("CLAUDE")
                || file_path.contains("claude");
            
            // Enhanced prefix for Claude-related logs
            let prefix = if is_claude_related {
                match record.level() {
                    log::Level::Error => "🔴 [CLAUDE ERROR]",
                    log::Level::Warn => "⚠️  [CLAUDE WARN]",
                    log::Level::Info => "ℹ️  [CLAUDE INFO]",
                    log::Level::Debug => "🔍 [CLAUDE DEBUG]",
                    log::Level::Trace => "🔎 [CLAUDE TRACE]",
                }
            } else {
                match record.level() {
                    log::Level::Error => "❌ [ERROR]",
                    log::Level::Warn => "⚠️  [WARN]",
                    log::Level::Info => "ℹ️  [INFO]",
                    log::Level::Debug => "🔍 [DEBUG]",
                    log::Level::Trace => "🔎 [TRACE]",
                }
            };
            
            writeln!(
                buf,
                "[{}] {} [{}] {}:{} - {}",
                timestamp,
                prefix,
                record.level(),
                file_path,
                line,
                record.args()
            )
        })
        .init();

    log::info!("==========================================");
    log::info!("Logging initialized successfully");
    log::info!("Log file: {:?}", log_file);
    log::info!("Log directory: {:?}", log_dir);
    if cfg!(debug_assertions) {
        log::info!("Mode: Development (logs in current directory)");
    } else {
        log::info!("Mode: Production (logs next to executable)");
        if let Ok(exe_path) = std::env::current_exe() {
            log::info!("Executable: {:?}", exe_path);
        }
    }
    log::info!("Log level: {} (set RUST_LOG environment variable to override)", 
        std::env::var("RUST_LOG").unwrap_or_else(|_| "warn (info for claude modules)".to_string()));
    log::info!("==========================================");
}

/// Clean up old log files, keeping only the last 30 days
fn cleanup_old_logs(log_dir: &PathBuf) {
    use std::fs;
    
    let entries = match fs::read_dir(log_dir) {
        Ok(entries) => entries,
        Err(_) => return,
    };

    let cutoff_date = chrono::Local::now() - chrono::Duration::days(30);
    let mut deleted_count = 0;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("log") {
            // Try to extract date from filename like "codestudio-20240101.log"
            if let Some(file_name) = path.file_name().and_then(|n| n.to_str()) {
                if let Some(date_str) = file_name.strip_prefix("codestudio-").and_then(|s| s.strip_suffix(".log")) {
                    if let Ok(file_date) = chrono::NaiveDate::parse_from_str(date_str, "%Y%m%d") {
                        if file_date < cutoff_date.date_naive() {
                            if let Err(e) = fs::remove_file(&path) {
                                eprintln!("Failed to delete old log file {:?}: {}", path, e);
                            } else {
                                deleted_count += 1;
                            }
                        }
                    }
                }
            }
        }
    }

    if deleted_count > 0 {
        eprintln!("Cleaned up {} old log file(s)", deleted_count);
    }
}

