import React, { useState, useEffect } from "react";
import { Loader2, Terminal, Globe, Plus, Trash2, Network } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { api, type MCPServer } from "@/lib/api";
import { useTrackEvent } from "@/hooks";

interface MCPEditServerProps {
  /**
   * The server to edit
   */
  server: MCPServer;
  /**
   * Whether the dialog is open
   */
  open: boolean;
  /**
   * Callback to close the dialog
   */
  onClose: () => void;
  /**
   * Callback when server is successfully updated
   */
  onServerUpdated: () => void;
  /**
   * Callback for error messages
   */
  onError: (message: string) => void;
}

interface EnvironmentVariable {
  id: string;
  key: string;
  value: string;
}

/**
 * Dialog component for editing existing MCP servers
 */
export const MCPEditServer: React.FC<MCPEditServerProps> = ({
  server,
  open,
  onClose,
  onServerUpdated,
  onError,
}) => {
  const [saving, setSaving] = useState(false);
  const trackEvent = useTrackEvent();

  // Form state
  const [name, setName] = useState("");
  const [command, setCommand] = useState("");
  const [args, setArgs] = useState("");
  const [url, setUrl] = useState("");
  const [scope, setScope] = useState("local");
  const [envVars, setEnvVars] = useState<EnvironmentVariable[]>([]);

  // Initialize form with server data when dialog opens
  useEffect(() => {
    if (open && server) {
      setName(server.name);
      setCommand(server.command || "");
      setArgs(server.args?.join(" ") || "");
      setUrl(server.url || "");
      setScope(server.scope || "local");

      // Convert env object to array
      const envArray = Object.entries(server.env || {}).map(([key, value]) => ({
        id: `env-${Date.now()}-${Math.random()}`,
        key,
        value,
      }));
      setEnvVars(envArray);
    }
  }, [open, server]);

  /**
   * Adds a new environment variable
   */
  const addEnvVar = () => {
    setEnvVars(prev => [
      ...prev,
      { id: `env-${Date.now()}`, key: "", value: "" },
    ]);
  };

  /**
   * Updates an environment variable
   */
  const updateEnvVar = (id: string, field: "key" | "value", value: string) => {
    setEnvVars(prev =>
      prev.map(v => (v.id === id ? { ...v, [field]: value } : v))
    );
  };

  /**
   * Removes an environment variable
   */
  const removeEnvVar = (id: string) => {
    setEnvVars(prev => prev.filter(v => v.id !== id));
  };

  /**
   * Handles form submission
   */
  const handleSave = async () => {
    if (!name.trim()) {
      onError("Server name is required");
      return;
    }

    if (server.transport === "stdio" && !command.trim()) {
      onError("Command is required for stdio transport");
      return;
    }

    if (server.transport === "sse" && !url.trim()) {
      onError("URL is required for SSE transport");
      return;
    }

    try {
      setSaving(true);

      // Parse arguments
      const parsedArgs = args.trim() ? args.split(/\s+/) : [];

      // Convert env vars to object
      const env = envVars.reduce((acc, { key, value }) => {
        if (key.trim() && value.trim()) {
          acc[key] = value;
        }
        return acc;
      }, {} as Record<string, string>);

      const result = await api.mcpUpdate(
        server.name, // oldName
        name,
        server.transport,
        server.transport === "stdio" ? command : undefined,
        parsedArgs,
        env,
        server.transport === "sse" ? url : undefined,
        scope
      );

      if (result.success) {
        trackEvent.mcpServerAdded({
          server_type: server.transport,
          configuration_method: "edit",
        });
        onServerUpdated();
        onClose();
      } else {
        onError(result.message);
      }
    } catch (error) {
      onError("Failed to update server");
      console.error("Failed to update MCP server:", error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {(() => {
              switch (server.transport.toLowerCase()) {
                case "stdio":
                  return <Terminal className="h-5 w-5 text-amber-500" />;
                case "http":
                  return <Globe className="h-5 w-5 text-emerald-500" />;
                case "sse":
                  return <Globe className="h-5 w-5 text-orange-500" />;
                case "websocket":
                  return <Network className="h-5 w-5 text-blue-500" />;
                default:
                  return <Network className="h-5 w-5 text-slate-500" />;
              }
            })()}
            Edit MCP Server
          </DialogTitle>
          <DialogDescription>
            Modify the configuration for "{server.name}"
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Server Name */}
          <div className="space-y-2">
            <Label htmlFor="edit-name">Server Name</Label>
            <Input
              id="edit-name"
              placeholder="my-server"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>

          {/* Command (stdio only) */}
          {server.transport === "stdio" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="edit-command">Command</Label>
                <Input
                  id="edit-command"
                  placeholder="/path/to/server"
                  value={command}
                  onChange={e => setCommand(e.target.value)}
                  className="font-mono"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-args">Arguments</Label>
                <Input
                  id="edit-args"
                  placeholder="arg1 arg2 arg3"
                  value={args}
                  onChange={e => setArgs(e.target.value)}
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  Space-separated command arguments
                </p>
              </div>
            </>
          )}

          {/* URL (for HTTP/SSE/WebSocket) */}
          {(server.transport === "http" || server.transport === "sse" || server.transport === "websocket") && (
            <div className="space-y-2">
              <Label htmlFor="edit-url">URL</Label>
              <Input
                id="edit-url"
                placeholder="https://example.com/mcp-endpoint"
                value={url}
                onChange={e => setUrl(e.target.value)}
                className="font-mono"
              />
              {server.transport === "sse" && (
                <p className="text-xs text-orange-600">
                  ⚠️ SSE is deprecated. Consider using HTTP instead.
                </p>
              )}
            </div>
          )}

          {/* Headers (HTTP only) */}
          {server.transport === "http" && (
            <div className="space-y-2">
              <Label>Headers (Optional)</Label>
              <div className="space-y-2">
                {Object.entries(server.env || {}).map(([key, value]) => (
                  <div key={key} className="flex items-center gap-2">
                    <Input
                      placeholder="Header Name"
                      value={key}
                      disabled
                      className="flex-1 font-mono text-sm bg-muted/50"
                    />
                    <span className="text-muted-foreground">:</span>
                    <Input
                      placeholder="Header Value"
                      value={value}
                      disabled
                      className="flex-1 font-mono text-sm bg-muted/50"
                    />
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">
                  Headers are stored in environment variables. Use the environment variables section below to manage them.
                </p>
              </div>
            </div>
          )}

          {/* Scope - Read Only */}
          <div className="space-y-2">
            <Label htmlFor="edit-scope">Scope</Label>
            <Input
              id="edit-scope"
              value={
                scope === "local"
                  ? "Local (this project only)"
                  : scope === "project"
                  ? "Project (shared via .mcp.json)"
                  : "User (all projects)"
              }
              disabled
              className="font-mono text-sm bg-muted/50"
            />
            <p className="text-xs text-muted-foreground">
              Scope cannot be changed after creation. To move a server to a different scope, remove it and create a new one.
            </p>
          </div>

          {/* Environment Variables */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Environment Variables</Label>
              <Button
                variant="outline"
                size="sm"
                onClick={addEnvVar}
                className="gap-2"
              >
                <Plus className="h-3 w-3" />
                Add Variable
              </Button>
            </div>

            {envVars.length > 0 && (
              <div className="space-y-2">
                {envVars.map(envVar => (
                  <div key={envVar.id} className="flex items-center gap-2">
                    <Input
                      placeholder="KEY"
                      value={envVar.key}
                      onChange={e => updateEnvVar(envVar.id, "key", e.target.value)}
                      className="flex-1 font-mono text-sm"
                    />
                    <span className="text-muted-foreground">=</span>
                    <Input
                      placeholder="value"
                      value={envVar.value}
                      onChange={e => updateEnvVar(envVar.id, "value", e.target.value)}
                      className="flex-1 font-mono text-sm"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeEnvVar(envVar.id)}
                      className="h-8 w-8 hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Saving...
              </>
            ) : (
              "Save Changes"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
