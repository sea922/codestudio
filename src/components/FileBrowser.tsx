import React, { useState, useEffect, useMemo } from "react";
import {
  Folder,
  FolderOpen,
  File,
  FileCode,
  ChevronRight,
  ChevronDown,
  ExternalLink,
  RefreshCw,
  Search,
  X,
  FileText,
  Image,
  Code,
  FileJson,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { api, type FileEntry } from "@/lib/api";
import { open } from "@tauri-apps/plugin-shell";
import { formatDistanceToNow } from "date-fns";

interface FileBrowserProps {
  projectPath: string;
  onFileSelect?: (file: FileEntry, previewUrl: string) => void;
  className?: string;
}

interface FileTreeNode {
  entry: FileEntry;
  children: Map<string, FileTreeNode>;
  parent?: FileTreeNode;
}

interface FileTypeFilter {
  id: string;
  label: string;
  icon: React.ReactNode;
  extensions: string[];
}

// Text file extensions that can be previewed in dialog
const TEXT_FILE_EXTENSIONS = ['txt', 'md', 'log', 'json', 'yaml', 'yml', 'xml', 'csv', 'ini', 'conf', 'toml', 'cfg', 'env', 'properties', 'sh', 'bat', 'cmd', 'ps1', 'bash', 'zsh'];

const FILE_TYPE_FILTERS: FileTypeFilter[] = [
  {
    id: "all",
    label: "全部",
    icon: <File className="h-3.5 w-3.5" />,
    extensions: [], // Empty means all files
  },
  {
    id: "html",
    label: "HTML/Web",
    icon: <FileCode className="h-3.5 w-3.5" />,
    extensions: ["html", "htm", "css", "js", "ts", "jsx", "tsx", "vue", "svelte", "scss", "less"],
  },
  {
    id: "image",
    label: "图片",
    icon: <Image className="h-3.5 w-3.5" />,
    extensions: ["png", "jpg", "jpeg", "gif", "svg", "webp", "ico", "bmp", "tiff"],
  },
  {
    id: "code",
    label: "代码",
    icon: <Code className="h-3.5 w-3.5" />,
    extensions: ["py", "java", "cpp", "c", "h", "hpp", "rs", "go", "php", "rb", "swift", "kt", "scala", "clj"],
  },
  {
    id: "document",
    label: "文档",
    icon: <FileText className="h-3.5 w-3.5" />,
    extensions: ["md", "txt", "pdf", "doc", "docx", "rtf"],
  },
  {
    id: "data",
    label: "数据",
    icon: <FileJson className="h-3.5 w-3.5" />,
    extensions: ["json", "xml", "yaml", "yml", "csv", "toml", "ini", "conf"],
  },
];

/**
 * FileBrowser component - Displays project file tree with HTML preview support
 */
export const FileBrowser: React.FC<FileBrowserProps> = ({
  projectPath,
  onFileSelect: _onFileSelect,
  className,
}) => {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [selectedFilter, setSelectedFilter] = useState<string>("all");
  
  // Text file preview state
  const [previewFile, setPreviewFile] = useState<FileEntry | null>(null);
  const [fileContent, setFileContent] = useState<string>("");
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [showPreviewDialog, setShowPreviewDialog] = useState(false);

  // Build file tree from flat list
  const fileTree = useMemo(() => {
    const root: FileTreeNode = {
      entry: {
        name: "",
        path: "",
        is_directory: true,
        size: 0,
      },
      children: new Map(),
    };

    for (const file of files) {
      const parts = file.path.split(/[/\\]/).filter(Boolean);
      let current = root;

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const isLast = i === parts.length - 1;

        if (!current.children.has(part)) {
          const fullPath = parts.slice(0, i + 1).join("/");
          current.children.set(part, {
            entry: {
              name: part,
              path: fullPath,
              is_directory: !isLast || file.is_directory,
              size: isLast ? file.size : 0,
              extension: isLast ? file.extension : undefined,
            },
            children: new Map(),
            parent: current,
          });
        }

        current = current.children.get(part)!;
      }
    }

    return root;
  }, [files]);

  // Filter files based on search query and file type filter
  const filteredTree = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const filter = FILE_TYPE_FILTERS.find((f) => f.id === selectedFilter);
    
    // Apply filters
    let filteredFiles = files;
    
    // Apply file type filter
    if (filter && filter.id !== "all" && filter.extensions.length > 0) {
      const matchingFiles = new Set<string>();
      
      // First pass: find all matching files
      files.forEach((file) => {
        if (!file.is_directory) {
          const ext = file.extension?.toLowerCase() || "";
          if (filter.extensions.includes(ext)) {
            matchingFiles.add(file.path);
            // Add all parent directories
            const parts = file.path.split(/[/\\]/).filter(Boolean);
            for (let i = 1; i < parts.length; i++) {
              const parentPath = parts.slice(0, i).join("/");
              matchingFiles.add(parentPath);
            }
          }
        }
      });
      
      // Second pass: include directories and matching files
      filteredFiles = files.filter((file) => {
        if (file.is_directory) {
          return matchingFiles.has(file.path);
        }
        return matchingFiles.has(file.path);
      });
    }
    
    // Apply search query filter
    if (query) {
      const matchingPaths = new Set<string>();
      
      // Find matching files and their parent directories
      filteredFiles.forEach((file) => {
        if (
          file.name.toLowerCase().includes(query) ||
          file.path.toLowerCase().includes(query)
        ) {
          matchingPaths.add(file.path);
          // Add all parent directories
          const parts = file.path.split(/[/\\]/).filter(Boolean);
          for (let i = 1; i < parts.length; i++) {
            const parentPath = parts.slice(0, i).join("/");
            matchingPaths.add(parentPath);
          }
        }
      });
      
      filteredFiles = filteredFiles.filter((file) => matchingPaths.has(file.path));
    }

    // Build tree from filtered files
    const root: FileTreeNode = {
      entry: {
        name: "",
        path: "",
        is_directory: true,
        size: 0,
      },
      children: new Map(),
    };

    for (const file of filteredFiles) {
      const parts = file.path.split(/[/\\]/).filter(Boolean);
      let current = root;

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const isLast = i === parts.length - 1;

        if (!current.children.has(part)) {
          const fullPath = parts.slice(0, i + 1).join("/");
          current.children.set(part, {
            entry: {
              name: part,
              path: fullPath,
              is_directory: !isLast || file.is_directory,
              size: isLast ? file.size : 0,
              extension: isLast ? file.extension : undefined,
            },
            children: new Map(),
            parent: current,
          });
        }

        current = current.children.get(part)!;
      }
    }

    // Auto-expand all nodes when searching or filtering
    if (query || (filter && filter.id !== "all")) {
      const expandAll = (node: FileTreeNode, path: string = "") => {
        if (node.children.size > 0) {
          setExpandedPaths((prev) => new Set(prev).add(path || "/"));
          node.children.forEach((child, name) => {
            expandAll(child, path ? `${path}/${name}` : name);
          });
        }
      };
      expandAll(root);
    }

    return root;
  }, [fileTree, searchQuery, files, selectedFilter]);

  // Load files on mount and when project path changes
  useEffect(() => {
    if (projectPath) {
      loadFiles();
      checkServerStatus();
      // Auto-expand root directory
      setExpandedPaths(new Set([""]));
    }
  }, [projectPath]);

  // Check if server is already running
  const checkServerStatus = async () => {
    try {
      const url = await api.getFileServerUrl();
      setServerUrl(url);
    } catch (err) {
      console.error("Failed to check server status:", err);
    }
  };

  const loadFiles = async () => {
    if (!projectPath) return;

    try {
      setIsLoading(true);
      setError(null);
      const fileList = await api.listProjectFiles(projectPath);
      setFiles(fileList);
    } catch (err) {
      console.error("Failed to load files:", err);
      setError("Failed to load files");
    } finally {
      setIsLoading(false);
    }
  };

  const toggleExpand = (path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const handleFileClick = async (file: FileEntry) => {
    if (!file.path || file.path.trim() === '') {
      setError("Invalid file path");
      return;
    }

    const ext = file.extension?.toLowerCase() || '';
    const isHtml = ext === "html" || ext === "htm";
    const isTextFile = ext && TEXT_FILE_EXTENSIONS.includes(ext);

    try {
      if (isHtml) {
        // Handle HTML files - open in system browser via HTTP server
        // Ensure server is running
        let url = serverUrl;
        if (!url) {
          const serverInfo = await api.startFileServer(projectPath);
          url = serverInfo.url;
          setServerUrl(url);
        }

        // Construct preview URL
        // Normalize path: convert backslashes to forward slashes
        let normalizedPath = file.path.replace(/\\/g, '/');
        
        // Remove leading slash if present (ServeDir expects relative paths)
        if (normalizedPath.startsWith('/')) {
          normalizedPath = normalizedPath.substring(1);
        }
        
        // Ensure path is not empty
        if (!normalizedPath || normalizedPath.trim() === '') {
          setError("File path is empty");
          return;
        }
        
        // URL encode the path (but preserve slashes)
        const encodedPath = normalizedPath
          .split('/')
          .map(segment => segment ? encodeURIComponent(segment) : '')
          .filter(segment => segment !== '') // Remove empty segments
          .join('/');
        
        const previewUrl = `${url}/${encodedPath}`;
        
        // Open in system browser (Chrome, etc.)
        await open(previewUrl);
      } else if (isTextFile) {
        // Handle text files - open in preview dialog
        handlePreviewTextFile(file);
      }
    } catch (err) {
      console.error("Failed to open file:", err);
      setError(`Failed to open file: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handlePreviewTextFile = async (file: FileEntry) => {
    try {
      setIsLoadingPreview(true);
      setPreviewFile(file);
      setShowPreviewDialog(true);
      setError(null);
      
      // Build absolute path
      const normalizedProjectPath = projectPath.replace(/\\/g, '/').replace(/\/$/, '');
      const normalizedFilePath = file.path.replace(/\\/g, '/').replace(/^\//, '');
      const absolutePath = `${normalizedProjectPath}/${normalizedFilePath}`.replace(/\/+/g, '/');
      
      // Read file content using the API
      const content = await api.readTextFile(absolutePath);
      setFileContent(content);
    } catch (err) {
      console.error("Failed to read file:", err);
      setError(`Failed to read file: ${err instanceof Error ? err.message : String(err)}`);
      setFileContent("Failed to load file content");
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const closePreviewDialog = () => {
    setShowPreviewDialog(false);
    setPreviewFile(null);
    setFileContent("");
    setError(null);
  };

  const renderTreeNode = (node: FileTreeNode, level: number = 0): React.ReactNode => {
    const children = Array.from(node.children.values()).sort((a, b) => {
      if (a.entry.is_directory !== b.entry.is_directory) {
        return a.entry.is_directory ? -1 : 1;
      }
      return a.entry.name.localeCompare(b.entry.name);
    });

    if (level === 0 && children.length === 0) {
      return null;
    }

    return (
      <>
        {children.map((child) => {
          const isExpanded = expandedPaths.has(child.entry.path);
          const hasChildren = child.children.size > 0;
          const ext = child.entry.extension?.toLowerCase() || '';
          const isHtml = ext === "html" || ext === "htm";
          const isTextFile = ext && TEXT_FILE_EXTENSIONS.includes(ext);
          
          // Format modified time if available
          const modifiedTimeDisplay = child.entry.modified_time
            ? formatDistanceToNow(new Date(child.entry.modified_time * 1000), { addSuffix: true })
            : null;

          return (
            <div key={child.entry.path}>
              <div
                className="flex items-center gap-1 px-2 py-1.5 rounded-md cursor-pointer hover:bg-accent/50 transition-colors group"
                style={{ paddingLeft: `${level * 16 + 8}px` }}
              >
                {child.entry.is_directory ? (
                  <>
                    <button
                      onClick={() => toggleExpand(child.entry.path)}
                      className="flex items-center justify-center w-4 h-4"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-3 w-3 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-3 w-3 text-muted-foreground" />
                      )}
                    </button>
                    {isExpanded ? (
                      <FolderOpen className="h-4 w-4 text-blue-500" />
                    ) : (
                      <Folder className="h-4 w-4 text-blue-500" />
                    )}
                  </>
                ) : (
                  <>
                    <div className="w-4" /> {/* Spacer for alignment */}
                    {isHtml ? (
                      <FileCode className="h-4 w-4 text-orange-500" />
                    ) : isTextFile ? (
                      <FileText className="h-4 w-4 text-blue-500" />
                    ) : (
                      <File className="h-4 w-4 text-muted-foreground" />
                    )}
                  </>
                )}
                <div
                  className="flex-1 min-w-0 flex flex-col"
                  onClick={() => {
                    if (!child.entry.is_directory) {
                      handleFileClick(child.entry);
                    } else {
                      toggleExpand(child.entry.path);
                    }
                  }}
                >
                  <span
                    className={cn(
                      "text-sm truncate",
                      isHtml && "font-medium text-orange-600 dark:text-orange-400",
                      isTextFile && "text-blue-600 dark:text-blue-400"
                    )}
                  >
                    {child.entry.name}
                  </span>
                  {!child.entry.is_directory && modifiedTimeDisplay && (
                    <span className="text-xs text-muted-foreground truncate">
                      {modifiedTimeDisplay}
                    </span>
                  )}
                </div>
                {(isHtml || isTextFile) && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleFileClick(child.entry);
                    }}
                    title={isHtml ? "Open in browser" : "Preview file"}
                  >
                    {isTextFile ? <FileText className="h-3 w-3" /> : <ExternalLink className="h-3 w-3" />}
                  </Button>
                )}
              </div>
              {child.entry.is_directory && isExpanded && hasChildren && (
                <div>{renderTreeNode(child, level + 1)}</div>
              )}
            </div>
          );
        })}
      </>
    );
  };

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <h3 className="text-lg font-semibold">Project Files</h3>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={loadFiles}
            className="h-8 w-8"
            title="Refresh file list"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="p-4 border-b border-border space-y-3">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 pr-8"
          />
          {searchQuery && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-0 top-0 h-full w-8"
              onClick={() => setSearchQuery("")}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
        
        {/* File Type Filters */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {FILE_TYPE_FILTERS.map((filter) => (
            <Button
              key={filter.id}
              variant={selectedFilter === filter.id ? "default" : "outline"}
              size="sm"
              className={cn(
                "h-7 gap-1.5 whitespace-nowrap text-xs",
                selectedFilter === filter.id && "bg-primary text-primary-foreground"
              )}
              onClick={() => setSelectedFilter(filter.id)}
            >
              {filter.icon}
              {filter.label}
            </Button>
          ))}
        </div>
      </div>

      {/* File Tree */}
      <div className="flex-1 overflow-y-auto p-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="text-sm text-destructive p-4">{error}</div>
        ) : files.length === 0 ? (
          <div className="text-sm text-muted-foreground p-4 text-center">
            No files found
          </div>
        ) : (
          <div className="space-y-1">{renderTreeNode(filteredTree)}</div>
        )}
      </div>

      {/* Text File Preview Dialog */}
      {showPreviewDialog && previewFile && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-background rounded-lg shadow-xl w-full max-w-4xl h-[80vh] flex flex-col">
            {/* Dialog Header */}
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-blue-500" />
                <div>
                  <h3 className="font-semibold text-lg">{previewFile.name}</h3>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span>{(previewFile.size / 1024).toFixed(1)} KB</span>
                    <span>{fileContent.split('\n').length} lines</span>
                    <span>{fileContent.length} characters</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={loadFiles}
                  className="h-8 w-8"
                  title="Refresh file list"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={closePreviewDialog}
                  className="h-8 w-8"
                  title="Close preview"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Dialog Content */}
            <div className="flex-1 overflow-hidden p-4">
              {isLoadingPreview ? (
                <div className="flex items-center justify-center h-full">
                  <div className="flex items-center gap-3">
                    <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Loading file content...</span>
                  </div>
                </div>
              ) : (
                <div className="h-full flex flex-col">
                  {/* Content Controls */}
                  <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
                    <div className="text-sm text-muted-foreground">
                      Text file preview
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const blob = new Blob([fileContent], { type: 'text/plain' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = previewFile.name;
                          a.click();
                          URL.revokeObjectURL(url);
                        }}
                        title="Download file"
                      >
                        <ExternalLink className="h-3 w-3 mr-1" />
                        Download
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          navigator.clipboard.writeText(fileContent);
                        }}
                        title="Copy content"
                      >
                        Copy
                      </Button>
                    </div>
                  </div>
                  
                  {/* Scrollable Content */}
                  <div className="flex-1 overflow-auto">
                    <pre className="text-sm whitespace-pre-wrap break-words font-mono leading-relaxed">
                      {fileContent}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

