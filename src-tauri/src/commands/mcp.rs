#![allow(dead_code)]

use anyhow::{Context, Result};
use dirs;
use log::{error, info};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use tauri::AppHandle;

/// Helper function to create a std::process::Command with proper environment variables
/// This ensures commands like Claude can find Node.js and other dependencies
fn create_command_with_env(program: &str) -> Command {
    crate::claude_binary::create_command_with_env(program)
}

/// Cleans up command string by removing status indicators from claude mcp list output
/// Examples of patterns to remove:
/// - "- ✓ Connected"
/// - "- ✗ Failed to connect"
/// - "- ✓ connected"
/// - "- ✗ failed"
fn clean_command_string(command: &str) -> String {
    // Pattern: " - ✓ ..." or " - ✗ ..." at the end
    let patterns = [
        " - ✓ Connected",
        " - ✗ Failed to connect",
        " - ✓ connected",
        " - ✗ failed",
        " - ✓",
        " - ✗",
    ];

    let mut result = command.to_string();
    for pattern in patterns {
        if let Some(pos) = result.find(pattern) {
            result = result[..pos].trim().to_string();
            break;
        }
    }

    // Also handle case-insensitive and variations
    // Look for pattern: " - " followed by checkmark or X symbol
    if let Some(pos) = result.find(" - ✓") {
        result = result[..pos].trim().to_string();
    } else if let Some(pos) = result.find(" - ✗") {
        result = result[..pos].trim().to_string();
    }

    result
}

/// Finds the full path to the claude binary
/// This is necessary because macOS apps have a limited PATH environment
fn find_claude_binary(app_handle: &AppHandle) -> Result<String> {
    crate::claude_binary::find_claude_binary(app_handle).map_err(|e| anyhow::anyhow!(e))
}

/// Represents an MCP server configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MCPServer {
    /// Server name/identifier
    pub name: String,
    /// Transport type: "stdio" or "sse"
    pub transport: String,
    /// Command to execute (for stdio)
    pub command: Option<String>,
    /// Command arguments (for stdio)
    pub args: Vec<String>,
    /// Environment variables
    pub env: HashMap<String, String>,
    /// URL endpoint (for SSE)
    pub url: Option<String>,
    /// Configuration scope: "local", "project", or "user"
    pub scope: String,
    /// Whether the server is currently active
    pub is_active: bool,
    /// Server status
    pub status: ServerStatus,
}

/// Server status information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerStatus {
    /// Whether the server is running
    pub running: bool,
    /// Last error message if any
    pub error: Option<String>,
    /// Last checked timestamp
    pub last_checked: Option<u64>,
}

/// MCP configuration file paths
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MCPConfigPaths {
    /// Local config path (project-specific, private)
    pub local: String,
    /// Project config path (.mcp.json, shared)
    pub project: String,
    /// User config path (global)
    pub user: String,
}

/// MCP configuration for project scope (.mcp.json)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MCPProjectConfig {
    #[serde(rename = "mcpServers")]
    pub mcp_servers: HashMap<String, MCPServerConfig>,
}

/// Individual server configuration in .mcp.json
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MCPServerConfig {
    #[serde(rename = "type")]
    pub transport_type: String,
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub env: HashMap<String, String>,
    #[serde(default)]
    pub url: Option<String>,
    #[serde(default)]
    pub headers: Option<HashMap<String, String>>,
}

/// Result of adding a server
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AddServerResult {
    pub success: bool,
    pub message: String,
    pub server_name: Option<String>,
}

/// Import result for multiple servers
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportResult {
    pub imported_count: u32,
    pub failed_count: u32,
    pub servers: Vec<ImportServerResult>,
}

/// Result for individual server import
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportServerResult {
    pub name: String,
    pub success: bool,
    pub error: Option<String>,
}

/// Executes a claude mcp command
fn execute_claude_mcp_command(app_handle: &AppHandle, args: Vec<&str>) -> Result<String> {
    info!("Executing claude mcp command with args: {:?}", args);

    let claude_path = find_claude_binary(app_handle)?;
    let mut cmd = create_command_with_env(&claude_path);
    cmd.arg("mcp");
    for arg in args {
        cmd.arg(arg);
    }

    let output = cmd.output().context("Failed to execute claude command")?;

    if output.status.success() {
        Ok(crate::claude_binary::decode_command_output(&output.stdout))
    } else {
        let stderr = crate::claude_binary::decode_command_output(&output.stderr);
        Err(anyhow::anyhow!("Command failed: {}", stderr))
    }
}

/// Adds a new MCP server
#[tauri::command]
pub async fn mcp_add(
    app: AppHandle,
    name: String,
    transport: String,
    command: Option<String>,
    args: Vec<String>,
    env: HashMap<String, String>,
    url: Option<String>,
    scope: String,
) -> Result<AddServerResult, String> {
    info!("Adding MCP server: {} with transport: {}", name, transport);

    // Prepare owned strings for environment variables
    let env_args: Vec<String> = env
        .iter()
        .map(|(key, value)| format!("{}={}", key, value))
        .collect();

    let mut cmd_args = vec!["add"];

    // Add scope flag
    cmd_args.push("-s");
    cmd_args.push(&scope);

    // Add transport flag for SSE
    if transport == "sse" {
        cmd_args.push("--transport");
        cmd_args.push("sse");
    }

    // Add environment variables
    for (i, _) in env.iter().enumerate() {
        cmd_args.push("-e");
        cmd_args.push(&env_args[i]);
    }

    // Add name
    cmd_args.push(&name);

    // Add command/URL based on transport
    if transport == "stdio" {
        if let Some(cmd) = &command {
            // Add "--" separator before command to prevent argument parsing issues
            if !args.is_empty() || cmd.contains('-') {
                cmd_args.push("--");
            }
            cmd_args.push(cmd);
            // Add arguments
            for arg in &args {
                cmd_args.push(arg);
            }
        } else {
            return Ok(AddServerResult {
                success: false,
                message: "Command is required for stdio transport".to_string(),
                server_name: None,
            });
        }
    } else if transport == "sse" {
        if let Some(url_str) = &url {
            cmd_args.push(url_str);
        } else {
            return Ok(AddServerResult {
                success: false,
                message: "URL is required for SSE transport".to_string(),
                server_name: None,
            });
        }
    }

    match execute_claude_mcp_command(&app, cmd_args) {
        Ok(output) => {
            info!("Successfully added MCP server: {}", name);
            Ok(AddServerResult {
                success: true,
                message: output.trim().to_string(),
                server_name: Some(name),
            })
        }
        Err(e) => {
            error!("Failed to add MCP server: {}", e);
            Ok(AddServerResult {
                success: false,
                message: e.to_string(),
                server_name: None,
            })
        }
    }
}

/// Lists all configured MCP servers
#[tauri::command]
pub async fn mcp_list(app: AppHandle) -> Result<Vec<MCPServer>, String> {
    info!("Listing MCP servers");

    match execute_claude_mcp_command(&app, vec!["list"]) {
        Ok(output) => {
            info!("Raw output from 'claude mcp list': {:?}", output);
            let trimmed = output.trim();
            info!("Trimmed output: {:?}", trimmed);

            // Check if no servers are configured
            if trimmed.contains("No MCP servers configured") || trimmed.is_empty() {
                info!("No servers found - empty or 'No MCP servers' message");
                return Ok(vec![]);
            }

            // Parse the text output to get server names
            let mut server_names = Vec::new();
            let lines: Vec<&str> = trimmed.lines().collect();
            info!("Total lines in output: {}", lines.len());
            for (idx, line) in lines.iter().enumerate() {
                info!("Line {}: {:?}", idx, line);
            }

            let mut i = 0;

            while i < lines.len() {
                let line = lines[i];
                info!("Processing line {}: {:?}", i, line);

                // Check if this line starts a new server entry
                if let Some(colon_pos) = line.find(':') {
                    info!("Found colon at position {} in line: {:?}", colon_pos, line);
                    // Make sure this is a server name line (not part of a path)
                    // Server names typically don't contain '/' or '\'
                    let potential_name = line[..colon_pos].trim();
                    info!("Potential server name: {:?}", potential_name);

                    if !potential_name.contains('/') && !potential_name.contains('\\') {
                        info!("Valid server name detected: {:?}", potential_name);
                        server_names.push(potential_name.to_string());
                        info!("Added server name to list: {:?}", potential_name);

                        // Skip to next server (skip continuation lines)
                        i += 1;
                        while i < lines.len() {
                            let next_line = lines[i];
                            info!("Checking next line {} for continuation: {:?}", i, next_line);

                            // If the next line starts with a server name pattern, break
                            if next_line.contains(':') {
                                let potential_next_name =
                                    next_line.split(':').next().unwrap_or("").trim();
                                info!(
                                    "Found colon in next line, potential name: {:?}",
                                    potential_next_name
                                );
                                if !potential_next_name.is_empty()
                                    && !potential_next_name.contains('/')
                                    && !potential_next_name.contains('\\')
                                {
                                    info!("Next line is a new server, breaking");
                                    break;
                                }
                            }
                            // Otherwise, this line is a continuation - skip it
                            info!("Line {} is a continuation, skipping", i);
                            i += 1;
                        }

                        continue;
                    } else {
                        info!("Skipping line - name contains path separators");
                    }
                } else {
                    info!("No colon found in line {}", i);
                }

                i += 1;
            }

            info!("Found {} MCP servers total", server_names.len());
            for (idx, name) in server_names.iter().enumerate() {
                info!("Server {}: name='{}'", idx, name);
            }

            // Get detailed information for each server including correct scope
            let mut servers = Vec::new();
            for name in server_names {
                info!("Getting details for server: {:?}", name);
                match mcp_get(app.clone(), name.clone()).await {
                    Ok(server_details) => {
                        info!("Successfully got details for server '{}': scope={}, transport={}",
                              name, server_details.scope, server_details.transport);
                        servers.push(server_details);
                    }
                    Err(e) => {
                        error!("Failed to get details for server '{}': {}", name, e);
                        // Add a basic server entry with the name if we can't get details
                        servers.push(MCPServer {
                            name: name.clone(),
                            transport: "stdio".to_string(),
                            command: None,
                            args: vec![],
                            env: HashMap::new(),
                            url: None,
                            scope: "local".to_string(),
                            is_active: false,
                            status: ServerStatus {
                                running: false,
                                error: Some(format!("Failed to get details: {}", e)),
                                last_checked: None,
                            },
                        });
                    }
                }
            }

            Ok(servers)
        }
        Err(e) => {
            error!("Failed to list MCP servers: {}", e);
            Err(e.to_string())
        }
    }
}

/// Gets details for a specific MCP server
#[tauri::command]
pub async fn mcp_get(app: AppHandle, name: String) -> Result<MCPServer, String> {
    info!("Getting MCP server details for: {}", name);

    match execute_claude_mcp_command(&app, vec!["get", &name]) {
        Ok(output) => {
            // Parse the structured text output
            let mut scope = "local".to_string();
            let mut transport = "stdio".to_string();
            let mut command = None;
            let mut args = vec![];
            let env = HashMap::new();
            let mut url = None;
            let mut is_connected = false;
            let mut status_error: Option<String> = None;

            for line in output.lines() {
                let line = line.trim();

                if line.starts_with("Scope:") {
                    let scope_part = line.replace("Scope:", "").trim().to_string();
                    if scope_part.to_lowercase().contains("local") {
                        scope = "local".to_string();
                    } else if scope_part.to_lowercase().contains("project") {
                        scope = "project".to_string();
                    } else if scope_part.to_lowercase().contains("user")
                        || scope_part.to_lowercase().contains("global")
                    {
                        scope = "user".to_string();
                    }
                } else if line.starts_with("Status:") {
                    let status_part = line.replace("Status:", "").trim().to_string();
                    if status_part.contains("✓") || status_part.to_lowercase().contains("connected") {
                        is_connected = true;
                    } else if status_part.contains("✗") || status_part.to_lowercase().contains("failed") {
                        is_connected = false;
                        status_error = Some(status_part);
                    }
                } else if line.starts_with("Type:") {
                    transport = line.replace("Type:", "").trim().to_string();
                } else if line.starts_with("Command:") {
                    command = Some(line.replace("Command:", "").trim().to_string());
                } else if line.starts_with("Args:") {
                    let args_str = line.replace("Args:", "").trim().to_string();
                    if !args_str.is_empty() {
                        args = args_str.split_whitespace().map(|s| s.to_string()).collect();
                    }
                } else if line.starts_with("URL:") {
                    url = Some(line.replace("URL:", "").trim().to_string());
                } else if line.starts_with("Environment:") {
                    // TODO: Parse environment variables if they're listed
                    // For now, we'll leave it empty
                }
            }

            Ok(MCPServer {
                name,
                transport,
                command,
                args,
                env,
                url,
                scope,
                is_active: is_connected,
                status: ServerStatus {
                    running: is_connected,
                    error: status_error,
                    last_checked: Some(std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_secs()),
                },
            })
        }
        Err(e) => {
            error!("Failed to get MCP server: {}", e);
            Err(e.to_string())
        }
    }
}

/// Removes an MCP server
#[tauri::command]
pub async fn mcp_remove(app: AppHandle, name: String) -> Result<String, String> {
    info!("Removing MCP server: {}", name);

    match execute_claude_mcp_command(&app, vec!["remove", &name]) {
        Ok(output) => {
            info!("Successfully removed MCP server: {}", name);
            Ok(output.trim().to_string())
        }
        Err(e) => {
            error!("Failed to remove MCP server: {}", e);
            Err(e.to_string())
        }
    }
}

/// Adds an MCP server from JSON configuration
#[tauri::command]
pub async fn mcp_add_json(
    app: AppHandle,
    name: String,
    json_config: String,
    scope: String,
) -> Result<AddServerResult, String> {
    info!(
        "Adding MCP server from JSON: {} with scope: {}",
        name, scope
    );

    // Build command args
    let mut cmd_args = vec!["add-json", &name, &json_config];

    // Add scope flag
    let scope_flag = "-s";
    cmd_args.push(scope_flag);
    cmd_args.push(&scope);

    match execute_claude_mcp_command(&app, cmd_args) {
        Ok(output) => {
            info!("Successfully added MCP server from JSON: {}", name);
            Ok(AddServerResult {
                success: true,
                message: output.trim().to_string(),
                server_name: Some(name),
            })
        }
        Err(e) => {
            error!("Failed to add MCP server from JSON: {}", e);
            Ok(AddServerResult {
                success: false,
                message: e.to_string(),
                server_name: None,
            })
        }
    }
}

/// Imports MCP servers from Claude Desktop
#[tauri::command]
pub async fn mcp_add_from_claude_desktop(
    app: AppHandle,
    scope: String,
) -> Result<ImportResult, String> {
    info!(
        "Importing MCP servers from Claude Desktop with scope: {}",
        scope
    );

    // Get Claude Desktop config path based on platform
    let config_path = if cfg!(target_os = "macos") {
        dirs::home_dir()
            .ok_or_else(|| "Could not find home directory".to_string())?
            .join("Library")
            .join("Application Support")
            .join("Claude")
            .join("claude_desktop_config.json")
    } else if cfg!(target_os = "linux") {
        // For WSL/Linux, check common locations
        dirs::config_dir()
            .ok_or_else(|| "Could not find config directory".to_string())?
            .join("Claude")
            .join("claude_desktop_config.json")
    } else {
        return Err(
            "Import from Claude Desktop is only supported on macOS and Linux/WSL".to_string(),
        );
    };

    // Check if config file exists
    if !config_path.exists() {
        return Err(
            "Claude Desktop configuration not found. Make sure Claude Desktop is installed."
                .to_string(),
        );
    }

    // Read and parse the config file
    let config_content = fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read Claude Desktop config: {}", e))?;

    let config: serde_json::Value = serde_json::from_str(&config_content)
        .map_err(|e| format!("Failed to parse Claude Desktop config: {}", e))?;

    // Extract MCP servers
    let mcp_servers = config
        .get("mcpServers")
        .and_then(|v| v.as_object())
        .ok_or_else(|| "No MCP servers found in Claude Desktop config".to_string())?;

    let mut imported_count = 0;
    let mut failed_count = 0;
    let mut server_results = Vec::new();

    // Import each server using add-json
    for (name, server_config) in mcp_servers {
        info!("Importing server: {}", name);

        // Convert Claude Desktop format to add-json format
        let mut json_config = serde_json::Map::new();

        // All Claude Desktop servers are stdio type
        json_config.insert(
            "type".to_string(),
            serde_json::Value::String("stdio".to_string()),
        );

        // Add command
        if let Some(command) = server_config.get("command").and_then(|v| v.as_str()) {
            json_config.insert(
                "command".to_string(),
                serde_json::Value::String(command.to_string()),
            );
        } else {
            failed_count += 1;
            server_results.push(ImportServerResult {
                name: name.clone(),
                success: false,
                error: Some("Missing command field".to_string()),
            });
            continue;
        }

        // Add args if present
        if let Some(args) = server_config.get("args").and_then(|v| v.as_array()) {
            json_config.insert("args".to_string(), args.clone().into());
        } else {
            json_config.insert("args".to_string(), serde_json::Value::Array(vec![]));
        }

        // Add env if present
        if let Some(env) = server_config.get("env").and_then(|v| v.as_object()) {
            json_config.insert("env".to_string(), env.clone().into());
        } else {
            json_config.insert(
                "env".to_string(),
                serde_json::Value::Object(serde_json::Map::new()),
            );
        }

        // Convert to JSON string
        let json_str = serde_json::to_string(&json_config)
            .map_err(|e| format!("Failed to serialize config for {}: {}", name, e))?;

        // Call add-json command
        match mcp_add_json(app.clone(), name.clone(), json_str, scope.clone()).await {
            Ok(result) => {
                if result.success {
                    imported_count += 1;
                    server_results.push(ImportServerResult {
                        name: name.clone(),
                        success: true,
                        error: None,
                    });
                    info!("Successfully imported server: {}", name);
                } else {
                    failed_count += 1;
                    let error_msg = result.message.clone();
                    server_results.push(ImportServerResult {
                        name: name.clone(),
                        success: false,
                        error: Some(result.message),
                    });
                    error!("Failed to import server {}: {}", name, error_msg);
                }
            }
            Err(e) => {
                failed_count += 1;
                let error_msg = e.clone();
                server_results.push(ImportServerResult {
                    name: name.clone(),
                    success: false,
                    error: Some(e),
                });
                error!("Error importing server {}: {}", name, error_msg);
            }
        }
    }

    info!(
        "Import complete: {} imported, {} failed",
        imported_count, failed_count
    );

    Ok(ImportResult {
        imported_count,
        failed_count,
        servers: server_results,
    })
}

/// Starts Claude Code as an MCP server
#[tauri::command]
pub async fn mcp_serve(app: AppHandle) -> Result<String, String> {
    info!("Starting Claude Code as MCP server");

    // Start the server in a separate process
    let claude_path = match find_claude_binary(&app) {
        Ok(path) => path,
        Err(e) => {
            error!("Failed to find claude binary: {}", e);
            return Err(e.to_string());
        }
    };

    let mut cmd = create_command_with_env(&claude_path);
    cmd.arg("mcp").arg("serve");

    match cmd.spawn() {
        Ok(_) => {
            info!("Successfully started Claude Code MCP server");
            Ok("Claude Code MCP server started".to_string())
        }
        Err(e) => {
            error!("Failed to start MCP server: {}", e);
            Err(e.to_string())
        }
    }
}

/// Tests connection to an MCP server
#[tauri::command]
pub async fn mcp_test_connection(app: AppHandle, name: String) -> Result<String, String> {
    info!("Testing connection to MCP server: {}", name);

    // For now, we'll use the get command to test if the server exists
    match execute_claude_mcp_command(&app, vec!["get", &name]) {
        Ok(_) => Ok(format!("Connection to {} successful", name)),
        Err(e) => Err(e.to_string()),
    }
}

/// Resets project-scoped server approval choices
#[tauri::command]
pub async fn mcp_reset_project_choices(app: AppHandle) -> Result<String, String> {
    info!("Resetting MCP project choices");

    match execute_claude_mcp_command(&app, vec!["reset-project-choices"]) {
        Ok(output) => {
            info!("Successfully reset MCP project choices");
            Ok(output.trim().to_string())
        }
        Err(e) => {
            error!("Failed to reset project choices: {}", e);
            Err(e.to_string())
        }
    }
}

/// Gets the status of MCP servers
#[tauri::command]
pub async fn mcp_get_server_status() -> Result<HashMap<String, ServerStatus>, String> {
    info!("Getting MCP server status");

    // TODO: Implement actual status checking
    // For now, return empty status
    Ok(HashMap::new())
}

/// Gets the MCP configuration file paths
#[tauri::command]
pub async fn mcp_get_config_paths(project_path: Option<String>) -> Result<MCPConfigPaths, String> {
    info!("Getting MCP config paths");

    // Get home directory for user config
    let home_dir = dirs::home_dir()
        .ok_or_else(|| "Could not find home directory".to_string())?;

    // User config: ~/.claude.json (global, available in all projects)
    let user_path = home_dir.join(".claude.json");

    // Local config: <project>/.claude/settings.local.json
    let local_path = if let Some(ref project) = project_path {
        PathBuf::from(project).join(".claude").join("settings.local.json")
    } else {
        PathBuf::from(".claude").join("settings.local.json")
    };

    // Project config: <project>/.mcp.json
    let project_config_path = if let Some(ref project) = project_path {
        PathBuf::from(project).join(".mcp.json")
    } else {
        PathBuf::from(".mcp.json")
    };

    Ok(MCPConfigPaths {
        local: local_path.to_string_lossy().to_string(),
        project: project_config_path.to_string_lossy().to_string(),
        user: user_path.to_string_lossy().to_string(),
    })
}

/// Reads .mcp.json from the current project
#[tauri::command]
pub async fn mcp_read_project_config(project_path: String) -> Result<MCPProjectConfig, String> {
    info!("Reading .mcp.json from project: {}", project_path);

    let mcp_json_path = PathBuf::from(&project_path).join(".mcp.json");

    if !mcp_json_path.exists() {
        return Ok(MCPProjectConfig {
            mcp_servers: HashMap::new(),
        });
    }

    match fs::read_to_string(&mcp_json_path) {
        Ok(content) => match serde_json::from_str::<MCPProjectConfig>(&content) {
            Ok(config) => Ok(config),
            Err(e) => {
                error!("Failed to parse .mcp.json: {}", e);
                Err(format!("Failed to parse .mcp.json: {}", e))
            }
        },
        Err(e) => {
            error!("Failed to read .mcp.json: {}", e);
            Err(format!("Failed to read .mcp.json: {}", e))
        }
    }
}

/// Updates an existing MCP server (remove + add)
#[tauri::command(rename_all = "snake_case")]
pub async fn mcp_update(
    app: AppHandle,
    old_name: String,
    name: String,
    transport: String,
    command: Option<String>,
    args: Vec<String>,
    env: HashMap<String, String>,
    url: Option<String>,
    scope: String,
) -> Result<AddServerResult, String> {
    info!("Updating MCP server: {} -> {}", old_name, name);

    // Step 1: 删除旧服务器
    if let Err(e) = execute_claude_mcp_command(&app, vec!["remove", &old_name]) {
        error!("Failed to remove old server: {}", e);
        return Ok(AddServerResult {
            success: false,
            message: format!("Failed to remove old server: {}", e),
            server_name: None,
        });
    }

    // Step 2: 添加新配置
    mcp_add(app, name, transport, command, args, env, url, scope).await
}

/// Saves .mcp.json to the current project
#[tauri::command]
pub async fn mcp_save_project_config(
    project_path: String,
    config: MCPProjectConfig,
) -> Result<String, String> {
    info!("Saving .mcp.json to project: {}", project_path);

    let mcp_json_path = PathBuf::from(&project_path).join(".mcp.json");

    let json_content = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;

    fs::write(&mcp_json_path, json_content)
        .map_err(|e| format!("Failed to write .mcp.json: {}", e))?;

    Ok("Project MCP configuration saved".to_string())
}
