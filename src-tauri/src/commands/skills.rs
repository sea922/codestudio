#![allow(dead_code)]

use anyhow::Result;
use chrono;
use dirs;
use log::{debug, error, info, warn};
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use tauri::AppHandle;

/// Represents a Skill's metadata extracted from YAML frontmatter
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SkillMetadata {
    pub name: String,
    pub description: String,
    pub allowed_tools: Option<Vec<String>>,
}

/// Represents a skill file
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SkillFile {
    pub name: String,
    pub path: String,
    pub content: Option<String>,
    pub is_directory: bool,
}

/// Represents a complete Skill
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Skill {
    pub name: String,
    pub skill_type: String, // "personal" or "project"
    pub description: String,
    pub file_path: String,
    pub yaml_frontmatter: Option<String>,
    pub markdown_content: String,
    pub files: Vec<SkillFile>,
    pub allowed_tools: Option<Vec<String>>,
    pub last_modified: String,
}

/// Validation result for a skill
#[derive(Debug, Serialize, Deserialize)]
pub struct ValidationResult {
    pub is_valid: bool,
    pub errors: Vec<String>,
    pub warnings: Vec<String>,
}

/// Get the personal skills directory path
fn get_personal_skills_dir(_app_handle: &AppHandle) -> Result<PathBuf, String> {
    dirs::home_dir()
        .ok_or("无法获取用户主目录".to_string())
        .map(|home| home.join(".claude").join("skills"))
}

/// Get the project skills directory path
fn get_project_skills_dir(_app_handle: &AppHandle) -> Result<PathBuf, String> {
    // Try to get the current working directory
    std::env::current_dir()
        .map_err(|e| {
            warn!("获取当前工作目录失败: {}", e);
            e.to_string()
        })
        .map(|cwd| {
            debug!("当前工作目录: {:?}", cwd);
            let project_root = if cwd.ends_with("src-tauri") {
                // If we're in src-tauri, go up one level to the project root
                let parent = cwd.parent()
                    .unwrap_or(&cwd)
                    .to_path_buf();
                debug!("检测到 src-tauri 目录，上溯到项目根目录: {:?}", parent);
                parent
            } else {
                cwd
            };
            let skills_dir = project_root.join(".claude").join("skills");
            debug!("项目技能目录路径: {:?}", skills_dir);
            skills_dir
        })
        .or_else(|_| {
            // Fallback: use a reasonable default relative to the app
            debug!("使用默认项目技能路径");
            Ok(PathBuf::from(".claude").join("skills"))
        })
}

/// Parse YAML frontmatter from SKILL.md content
fn parse_yaml_frontmatter(content: &str) -> Result<(Option<String>, String), String> {
    let trimmed = content.trim();

    if trimmed.starts_with("---") {
        // Find the closing --- by searching for it after the opening
        let after_opening = &trimmed[3..];
        let end_marker = after_opening.find("---\n")
            .or_else(|| after_opening.find("---\r\n"))
            .or_else(|| after_opening.find("---\n").or_else(|| after_opening.find("---\r\n")));

        match end_marker {
            Some(end_pos) => {
                let yaml_content = &after_opening[..end_pos].trim();
                let markdown_start = end_pos + 3; // Skip "---\n" or "---\r\n"
                let markdown_content = if markdown_start < after_opening.len() {
                    &after_opening[markdown_start..].trim()
                } else {
                    ""
                };
                Ok((Some(yaml_content.to_string()), markdown_content.to_string()))
            }
            None => Err("未找到 YAML 前置元数据结束符 '---'".to_string())
        }
    } else {
        Ok((None, trimmed.to_string()))
    }
}

/// Parse skill metadata from YAML frontmatter
fn parse_skill_metadata(yaml_content: &str) -> Result<SkillMetadata, String> {
    serde_yaml::from_str::<SkillMetadata>(yaml_content)
        .map_err(|e| format!("解析 YAML 元数据失败: {}", e))
}

/// Validate skill format
fn validate_skill(skill: &Skill) -> ValidationResult {
    let mut errors = Vec::new();
    let mut warnings = Vec::new();

    // Validate name
    if skill.name.len() > 64 {
        errors.push("技能名称不能超过 64 个字符".to_string());
    }
    if skill.name.len() < 1 {
        errors.push("技能名称不能为空".to_string());
    }
    if !skill.name.chars().all(|c| c.is_lowercase() || c.is_numeric() || c == '-') {
        errors.push("技能名称只能包含小写字母、数字和连字符".to_string());
    }

    // Validate description
    if skill.description.len() > 1024 {
        errors.push("技能描述不能超过 1024 个字符".to_string());
    }
    if skill.description.len() < 10 {
        warnings.push("建议提供更详细的技能描述（至少 10 个字符）".to_string());
    }

    // Validate YAML frontmatter
    if let Some(yaml_content) = &skill.yaml_frontmatter {
        if let Err(e) = serde_yaml::from_str::<serde_yaml::Value>(yaml_content) {
            errors.push(format!("YAML 语法错误: {}", e));
        }
    }

    // Check if files exist (only if file_path is not empty)
    if !skill.file_path.is_empty() && !Path::new(&skill.file_path).exists() {
        errors.push("技能目录不存在".to_string());
    }

    ValidationResult {
        is_valid: errors.is_empty(),
        errors,
        warnings,
    }
}

/// List all skills (both personal and project)
#[tauri::command]
pub async fn skill_list_all(
    app_handle: tauri::AppHandle,
) -> Result<Vec<Skill>, String> {
    let mut all_skills = Vec::new();

    // List personal skills
    match skill_list_by_type(app_handle.clone(), "personal".to_string()).await {
        Ok(mut personal_skills) => all_skills.append(&mut personal_skills),
        Err(e) => warn!("获取个人技能失败: {}", e),
    }

    // List project skills
    match skill_list_by_type(app_handle.clone(), "project".to_string()).await {
        Ok(mut project_skills) => all_skills.append(&mut project_skills),
        Err(e) => warn!("获取项目技能失败: {}", e),
    }

    Ok(all_skills)
}

/// List skills by type (personal or project)
#[tauri::command]
pub async fn skill_list_by_type(
    app_handle: tauri::AppHandle,
    skill_type: String,
) -> Result<Vec<Skill>, String> {
    let skills_dir = if skill_type == "personal" {
        get_personal_skills_dir(&app_handle)?
    } else {
        get_project_skills_dir(&app_handle)?
    };

    debug!("列出技能目录: {:?}", skills_dir);

    // Ensure directory exists
    if let Err(e) = fs::metadata(&skills_dir) {
        if e.kind() == std::io::ErrorKind::NotFound {
            info!("技能目录不存在，正在创建: {:?}", skills_dir);
            if let Err(create_err) = fs::create_dir_all(&skills_dir) {
                error!("创建技能目录失败: {}", create_err);
                return Err(format!("无法创建技能目录: {}", create_err));
            }
            debug!("技能目录创建成功");
        } else {
            error!("获取技能目录元数据失败: {}", e);
            return Err(format!("访问技能目录失败: {}", e));
        }
    }

    let mut skills = Vec::new();

    // Read all subdirectories in skills dir
    let entries = match fs::read_dir(&skills_dir) {
        Ok(entries) => entries,
        Err(e) => {
            error!("读取技能目录失败: {}", e);
            return Err(format!("无法读取技能目录: {}", e));
        }
    };

    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();

        if path.is_dir() {
            let skill_file = path.join("SKILL.md");

            if skill_file.exists() {
                match read_skill_file(app_handle.clone(), skill_file.to_string_lossy().to_string(), skill_type.clone()).await {
                    Ok(mut skill) => {
                        // Get additional files in the skill directory (optional, don't fail if this errors)
                        match list_skill_files(path.clone()).await {
                            Ok(files) => skill.files = files,
                            Err(e) => debug!("获取技能文件列表失败（可选）: {}", e),
                        }

                        skills.push(skill);
                    }
                    Err(e) => warn!("读取技能失败: {}", e),
                }
            } else {
                debug!("技能目录中没有 SKILL.md 文件: {:?}", path);
            }
        }
    }

    debug!("成功加载 {} 个技能", skills.len());
    Ok(skills)
}

/// Read a skill from SKILL.md file
#[tauri::command]
pub async fn skill_read(
    app_handle: tauri::AppHandle,
    name: String,
    skill_type: String,
) -> Result<Skill, String> {
    let skills_dir = if skill_type == "personal" {
        get_personal_skills_dir(&app_handle)?
    } else {
        get_project_skills_dir(&app_handle)?
    };

    let skill_path = skills_dir.join(&name).join("SKILL.md");

    if !skill_path.exists() {
        return Err(format!("技能 '{}' 不存在", name));
    }

    read_skill_file(app_handle.clone(), skill_path.to_string_lossy().to_string(), skill_type).await
}

/// Read skill file and parse it
async fn read_skill_file(
    _app_handle: tauri::AppHandle,
    skill_file_path: String,
    skill_type: String,
) -> Result<Skill, String> {
    let mut file = fs::File::open(&skill_file_path)
        .map_err(|e| format!("打开文件失败: {}", e))?;

    let mut content = String::new();
    file.read_to_string(&mut content)
        .map_err(|e| format!("读取文件失败: {}", e))?;

    let (yaml_frontmatter, markdown_content) = parse_yaml_frontmatter(&content)?;

    let mut metadata = SkillMetadata {
        name: skill_file_path
            .split('/')
            .nth_back(1)
            .unwrap_or("")
            .to_string(),
        description: String::new(),
        allowed_tools: None,
    };

    // Parse metadata if YAML frontmatter exists
    if let Some(yaml_content) = &yaml_frontmatter {
        match parse_skill_metadata(yaml_content) {
            Ok(parsed) => metadata = parsed,
            Err(e) => warn!("解析元数据失败: {}", e),
        }
    } else {
        // If no YAML frontmatter, try to extract name and description from first lines
        let lines: Vec<&str> = markdown_content.lines().take(10).collect();
        if !lines.is_empty() {
            let first_line = lines[0].trim_start_matches('#').trim();
            if !first_line.is_empty() {
                metadata.name = first_line.to_string();
            }
        }
    }

    // Get file modification time
    let file_metadata = fs::metadata(&skill_file_path)
        .map_err(|e| e.to_string())?;
    let last_modified = file_metadata.modified()
        .map_err(|e| e.to_string())?
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_secs();

    let last_modified_str = chrono::DateTime::from_timestamp(last_modified as i64, 0)
        .unwrap_or_default()
        .to_rfc3339();

    Ok(Skill {
        name: metadata.name,
        skill_type,
        description: metadata.description,
        file_path: {
            // Extract directory path from skill_file_path
            let path = Path::new(&skill_file_path);
            if let Some(parent) = path.parent() {
                // Remove trailing backslash if present (Windows)
                let path_str = parent.to_string_lossy().to_string();
                path_str.trim_end_matches(|c| c == '\\' || c == '/').to_string()
            } else {
                "".to_string()
            }
        },
        yaml_frontmatter,
        markdown_content,
        files: Vec::new(), // Will be populated by caller
        allowed_tools: metadata.allowed_tools,
        last_modified: last_modified_str,
    })
}

/// List files in a skill directory
async fn list_skill_files(skill_dir: PathBuf) -> Result<Vec<SkillFile>, String> {
    debug!("列出技能文件: {:?}", skill_dir);

    let mut files = Vec::new();

    if !skill_dir.exists() {
        debug!("技能目录不存在: {:?}", skill_dir);
        return Ok(files);
    }

    let entries = match fs::read_dir(&skill_dir) {
        Ok(entries) => entries,
        Err(e) => {
            error!("读取技能目录失败: {}", e);
            return Err(format!("读取技能目录失败: {}", e));
        }
    };

    for entry in entries {
        let entry = match entry.map_err(|e| e.to_string()) {
            Ok(entry) => entry,
            Err(e) => {
                warn!("读取目录项失败: {}", e);
                continue;
            }
        };
        let path = entry.path();
        let name = path.file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();

        debug!("发现文件: {} (is_dir: {})", name, path.is_dir());

        let is_dir = path.is_dir();
        let content = if is_dir {
            None
        } else {
            match fs::read_to_string(&path) {
                Ok(content) => {
                    debug!("读取文件内容成功: {} ({} 字符)", name, content.len());
                    Some(content)
                },
                Err(e) => {
                    warn!("读取文件失败 {}: {}", name, e);
                    None
                }
            }
        };

        files.push(SkillFile {
            name,
            path: path.to_string_lossy().to_string(),
            content,
            is_directory: is_dir,
        });
    }

    debug!("技能文件列表完成: {} 个文件", files.len());
    Ok(files)
}

/// Create a new skill
#[tauri::command]
pub async fn skill_create(
    app_handle: tauri::AppHandle,
    name: String,
    skill_type: String,
    description: String,
    markdown_content: String,
    allowed_tools: Option<Vec<String>>,
) -> Result<Skill, String> {
    debug!("开始创建技能: name={}, skill_type={}", name, skill_type);

    // Validate input
    if name.is_empty() {
        error!("技能名称为空");
        return Err("技能名称不能为空".to_string());
    }
    if name.len() > 64 {
        error!("技能名称过长: {} 字符", name.len());
        return Err("技能名称不能超过 64 个字符".to_string());
    }
    if !name.chars().all(|c| c.is_lowercase() || c.is_numeric() || c == '-') {
        error!("技能名称格式不正确: {}", name);
        return Err("技能名称只能包含小写字母、数字和连字符".to_string());
    }
    if description.len() > 1024 {
        error!("技能描述过长: {} 字符", description.len());
        return Err("技能描述不能超过 1024 个字符".to_string());
    }

    let skills_dir = if skill_type == "personal" {
        get_personal_skills_dir(&app_handle)?
    } else {
        get_project_skills_dir(&app_handle)?
    };

    debug!("技能目录路径: {:?}", skills_dir);

    let skill_dir = skills_dir.join(&name);
    let skill_file = skill_dir.join("SKILL.md");

    debug!("技能文件路径: {:?}", skill_file);

    // Check if skill already exists
    if skill_file.exists() {
        error!("技能已存在: {}", name);
        return Err(format!("技能 '{}' 已存在", name));
    }

    // Create skill directory
    debug!("创建技能目录: {:?}", skill_dir);
    fs::create_dir_all(&skill_dir)
        .map_err(|e| {
            error!("创建目录失败: {}", e);
            format!("创建技能目录失败: {}", e)
        })?;

    // Build YAML frontmatter
    let yaml_frontmatter = format!(
        "---\nname: {}\ndescription: \"{}\"{}\n---\n",
        name,
        description,
        if let Some(tools) = &allowed_tools {
            format!("\nallowed-tools: {}", tools.join(", "))
        } else {
            String::new()
        }
    );

    debug!("YAML frontmatter: {}", yaml_frontmatter);

    // Write SKILL.md file
    let content = format!("{}{}", yaml_frontmatter, markdown_content);
    debug!("写入文件内容长度: {} 字符", content.len());

    fs::write(&skill_file, content)
        .map_err(|e| {
            error!("写入文件失败: {}", e);
            format!("写入技能文件失败: {}", e)
        })?;

    debug!("技能创建成功: {}", name);

    // Return the created skill
    let skill = Skill {
        name,
        skill_type,
        description,
        file_path: skill_dir.to_string_lossy().to_string(),
        yaml_frontmatter: Some(yaml_frontmatter),
        markdown_content,
        files: Vec::new(),
        allowed_tools,
        last_modified: chrono::Utc::now().to_rfc3339(),
    };

    Ok(skill)
}

/// Update an existing skill
#[tauri::command]
pub async fn skill_update(
    app_handle: tauri::AppHandle,
    name: String,
    skill_type: String,
    description: Option<String>,
    markdown_content: Option<String>,
    allowed_tools: Option<Vec<String>>,
) -> Result<Skill, String> {
    let skills_dir = if skill_type == "personal" {
        get_personal_skills_dir(&app_handle)?
    } else {
        get_project_skills_dir(&app_handle)?
    };

    let skill_dir = skills_dir.join(&name);
    let skill_file = skill_dir.join("SKILL.md");

    if !skill_file.exists() {
        return Err(format!("技能 '{}' 不存在", name));
    }

    // Read current skill
    let mut skill = read_skill_file(app_handle.clone(), skill_file.to_string_lossy().to_string(), skill_type.clone()).await?;

    // Update fields if provided
    if let Some(desc) = description {
        skill.description = desc;
    }
    if let Some(content) = markdown_content {
        skill.markdown_content = content;
    }
    if let Some(tools) = allowed_tools {
        skill.allowed_tools = Some(tools);
    }

    // Rebuild YAML frontmatter
    let yaml_frontmatter = format!(
        "---\nname: {}\ndescription: \"{}\"{}\n---\n",
        skill.name,
        skill.description,
        if let Some(tools) = &skill.allowed_tools {
            format!("\nallowed-tools: {}", tools.join(", "))
        } else {
            String::new()
        }
    );

    // Write updated content
    let content = format!("{}{}", yaml_frontmatter, skill.markdown_content);
    fs::write(&skill_file, content).map_err(|e| e.to_string())?;

    skill.yaml_frontmatter = Some(yaml_frontmatter);
    skill.last_modified = chrono::Utc::now().to_rfc3339();

    Ok(skill)
}

/// Delete a skill
#[tauri::command]
pub async fn skill_delete(
    app_handle: tauri::AppHandle,
    name: String,
    skill_type: String,
) -> Result<(), String> {
    let skills_dir = if skill_type == "personal" {
        get_personal_skills_dir(&app_handle)?
    } else {
        get_project_skills_dir(&app_handle)?
    };

    let skill_dir = skills_dir.join(&name);

    if !skill_dir.exists() {
        return Err(format!("技能 '{}' 不存在", name));
    }

    // Remove the entire skill directory
    fs::remove_dir_all(&skill_dir).map_err(|e| e.to_string())?;

    Ok(())
}

/// Validate a skill
#[tauri::command]
pub async fn skill_validate(
    _app_handle: tauri::AppHandle,
    name: String,
    skill_type: String,
    description: String,
    markdown_content: String,
) -> Result<ValidationResult, String> {
    let temp_skill = Skill {
        name,
        skill_type,
        description,
        file_path: String::new(),
        yaml_frontmatter: None,
        markdown_content,
        files: Vec::new(),
        allowed_tools: None,
        last_modified: chrono::Utc::now().to_rfc3339(),
    };

    let validation_result = validate_skill(&temp_skill);
    Ok(validation_result)
}

/// Create a file in a skill directory
#[tauri::command]
pub async fn skill_create_file(
    app_handle: tauri::AppHandle,
    skill_name: String,
    skill_type: String,
    file_name: String,
    content: String,
) -> Result<(), String> {
    let skills_dir = if skill_type == "personal" {
        get_personal_skills_dir(&app_handle)?
    } else {
        get_project_skills_dir(&app_handle)?
    };

    let skill_dir = skills_dir.join(&skill_name);
    let file_path = skill_dir.join(&file_name);

    // Ensure the skill directory exists
    if !skill_dir.exists() {
        return Err(format!("技能 '{}' 不存在", skill_name));
    }

    // Write the file
    fs::write(&file_path, content).map_err(|e| e.to_string())?;

    Ok(())
}

/// Read a file from a skill directory
#[tauri::command]
pub async fn skill_read_file(
    app_handle: tauri::AppHandle,
    skill_name: String,
    skill_type: String,
    file_name: String,
) -> Result<String, String> {
    let skills_dir = if skill_type == "personal" {
        get_personal_skills_dir(&app_handle)?
    } else {
        get_project_skills_dir(&app_handle)?
    };

    let skill_dir = skills_dir.join(&skill_name);
    let file_path = skill_dir.join(&file_name);

    if !file_path.exists() {
        return Err(format!("文件 '{}' 不存在", file_name));
    }

    if file_path.is_dir() {
        return Err("指定路径是目录，不是文件".to_string());
    }

    fs::read_to_string(&file_path).map_err(|e| e.to_string())
}

/// Delete a file from a skill directory
#[tauri::command]
pub async fn skill_delete_file(
    app_handle: tauri::AppHandle,
    skill_name: String,
    skill_type: String,
    file_name: String,
) -> Result<(), String> {
    let skills_dir = if skill_type == "personal" {
        get_personal_skills_dir(&app_handle)?
    } else {
        get_project_skills_dir(&app_handle)?
    };

    let skill_dir = skills_dir.join(&skill_name);
    let file_path = skill_dir.join(&file_name);

    if !file_path.exists() {
        return Err(format!("文件 '{}' 不存在", file_name));
    }

    if file_path.is_dir() {
        fs::remove_dir_all(&file_path).map_err(|e| e.to_string())?;
    } else {
        fs::remove_file(&file_path).map_err(|e| e.to_string())?;
    }

    Ok(())
}
