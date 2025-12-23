import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Trash2,
  Edit,
  FileText,
  FolderOpen,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Loader2,
  Package,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { api, type Skill, type ValidationResult } from "@/lib/api";
import { cn } from "@/lib/utils";

interface SkillManagerProps {
  className?: string;
}

interface CreateSkillModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (skill: Partial<Skill>) => Promise<void>;
  skillType: "personal" | "project";
  initialData?: Partial<Skill>;
  title?: string;
}

const CreateSkillModal: React.FC<CreateSkillModalProps> = ({
  isOpen,
  onClose,
  onSave,
  skillType,
  initialData,
  title,
}) => {
  const isEditing = !!initialData;
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [markdownContent, setMarkdownContent] = useState("# New Skill\n\n## Instructions\n\nDescribe what this skill does...\n\n## Examples\n\nProvide usage examples...");
  const [allowedTools, setAllowedTools] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [validation, setValidation] = useState<ValidationResult | null>(null);

  // Initialize form with initial data when opening in edit mode
  useEffect(() => {
    if (isOpen) {
      if (isEditing && initialData) {
        setName(initialData.name || "");
        setDescription(initialData.description || "");
        setMarkdownContent(initialData.markdown_content || "# New Skill\n\n## Instructions\n\nDescribe what this skill does...\n\n## Examples\n\nProvide usage examples...");
        setAllowedTools(initialData.allowed_tools || []);
      } else {
        // Reset form for create mode
        setName("");
        setDescription("");
        setMarkdownContent("# New Skill\n\n## Instructions\n\nDescribe what this skill does...\n\n## Examples\n\nProvide usage examples...");
        setAllowedTools([]);
      }
      setValidation(null);
    }
  }, [isOpen, isEditing, initialData]);

  const validateSkill = async () => {
    if (!name.trim() || !description.trim()) return;

    try {
      const result = await api.skillValidate(name, skillType, description, markdownContent);
      setValidation(result);
    } catch (error) {
      console.error("Validation failed:", error);
    }
  };

  useEffect(() => {
    if (name && description) {
      const timer = setTimeout(() => {
        validateSkill();
      }, 500);

      return () => clearTimeout(timer);
    }
  }, [name, description, markdownContent]);

  const handleSave = async () => {
    if (!name.trim() || !description.trim()) return;

    setIsSaving(true);
    try {
      await onSave({
        name,
        skill_type: skillType,
        description,
        markdown_content: markdownContent,
        allowed_tools: allowedTools.length > 0 ? allowedTools : undefined,
      });

      onClose();
    } catch (error) {
      console.error("Failed to save skill:", error);
      alert(`保存技能失败: ${error}`);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-background rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
      >
        <div className="p-6 border-b">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">{title || (isEditing ? "Edit Skill" : "Create New Skill")}</h2>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <XCircle className="h-5 w-5" />
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Skill Name */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., pdf-processor"
              className="w-full px-3 py-2 border rounded-md bg-background"
            />
            <p className="text-xs text-muted-foreground">
              Lowercase letters, numbers, and hyphens only (max 64 characters)
            </p>
          </div>

          {/* Skill Description */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Description *</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what this skill does and when to use it..."
              className="w-full px-3 py-2 border rounded-md bg-background h-24 resize-none"
            />
            <p className="text-xs text-muted-foreground">
              Explain when Claude should use this skill (max 1024 characters)
            </p>
          </div>

          {/* Validation Results */}
          {validation && (
            <div className="space-y-2">
              {validation.errors.length > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm font-medium text-destructive">
                    <XCircle className="h-4 w-4" />
                    Errors:
                  </div>
                  <ul className="text-sm text-destructive space-y-1 ml-6">
                    {validation.errors.map((error, idx) => (
                      <li key={idx} className="list-disc">• {error}</li>
                    ))}
                  </ul>
                </div>
              )}
              {validation.warnings.length > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm font-medium text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="h-4 w-4" />
                    Warnings:
                  </div>
                  <ul className="text-sm text-amber-600 dark:text-amber-400 space-y-1 ml-6">
                    {validation.warnings.map((warning, idx) => (
                      <li key={idx} className="list-disc">• {warning}</li>
                    ))}
                  </ul>
                </div>
              )}
              {validation.is_valid && validation.errors.length === 0 && (
                <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                  <CheckCircle className="h-4 w-4" />
                  Valid skill format
                </div>
              )}
            </div>
          )}

          {/* Markdown Content */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Instructions & Examples</label>
            <textarea
              value={markdownContent}
              onChange={(e) => setMarkdownContent(e.target.value)}
              className="w-full px-3 py-2 border rounded-md bg-background h-64 font-mono text-sm"
            />
          </div>

          {/* Allowed Tools */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Allowed Tools (Optional)</label>
            <div className="flex flex-wrap gap-2">
              {["Read", "Grep", "Glob", "Write", "Bash"].map((tool) => (
                <label key={tool} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={allowedTools.includes(tool)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setAllowedTools([...allowedTools, tool]);
                      } else {
                        setAllowedTools(allowedTools.filter((t) => t !== tool));
                      }
                    }}
                    className="rounded border-gray-300"
                  />
                  <span className="text-sm">{tool}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="p-6 border-t flex items-center justify-end gap-3">
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving || !name || !description}>
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {isEditing ? "Updating..." : "Creating..."}
              </>
            ) : (
              isEditing ? "Update Skill" : "Create Skill"
            )}
          </Button>
        </div>
      </motion.div>
    </div>
  );
};

export const SkillManager: React.FC<SkillManagerProps> = ({ className }) => {
  const [personalSkills, setPersonalSkills] = useState<Skill[]>([]);
  const [projectSkills, setProjectSkills] = useState<Skill[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("personal");
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createSkillType, setCreateSkillType] = useState<"personal" | "project">("personal");
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editSkill, setEditSkill] = useState<Skill | null>(null);

  const loadSkills = async () => {
    setIsLoading(true);
    try {
      console.log("开始加载技能...");
      const [personal, project] = await Promise.all([
        api.skillListByType("personal"),
        api.skillListByType("project"),
      ]);
      console.log("个人技能:", personal.length, "项目技能:", project.length);
      setPersonalSkills(personal);
      setProjectSkills(project);
    } catch (error) {
      console.error("Failed to load skills:", error);
      // 即使加载失败也设置为空数组，避免界面卡住
      setPersonalSkills([]);
      setProjectSkills([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSkills();
  }, []);

  const handleCreateSkill = async (skillData: Partial<Skill>) => {
    await api.skillCreate(
      skillData.name!,
      skillData.skill_type!,
      skillData.description!,
      skillData.markdown_content!,
      skillData.allowed_tools
    );
    await loadSkills();
  };

  const handleEditSkill = async (skill: Skill) => {
    setEditSkill(skill);
    setEditModalOpen(true);
  };

  const handleUpdateSkill = async (skillData: Partial<Skill>) => {
    if (!editSkill) return;

    await api.skillUpdate(
      editSkill.name,
      editSkill.skill_type,
      skillData.description,
      skillData.markdown_content,
      skillData.allowed_tools
    );
    await loadSkills();
    setEditModalOpen(false);
    setEditSkill(null);
  };

  const handleDeleteSkill = async (skill: Skill) => {
    if (!confirm(`Are you sure you want to delete "${skill.name}"?`)) return;

    try {
      await api.skillDelete(skill.name, skill.skill_type);
      await loadSkills();
    } catch (error) {
      console.error("Failed to delete skill:", error);
      alert("Failed to delete skill. Please try again.");
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString() + " " + date.toLocaleTimeString();
  };

  const renderSkillCard = (skill: Skill) => (
    <motion.div
      key={`${skill.skill_type}-${skill.name}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
    >
      <Card className="p-4 hover:shadow-md transition-shadow">
        <div className="space-y-3">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                <h3 className="font-semibold">{skill.name}</h3>
                <Badge variant="outline" className="text-xs">
                  {skill.skill_type}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                {skill.description}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => handleEditSkill(skill)}
                title="Edit skill"
              >
                <Edit className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:text-destructive"
                onClick={() => handleDeleteSkill(skill)}
                title="Delete skill"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1 min-w-0 flex-1">
              <FolderOpen className="h-3 w-3 flex-shrink-0" />
              <span className="truncate" title={skill.file_path}>
                {skill.file_path}
              </span>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <FileText className="h-3 w-3" />
              <span>{skill.files.length} files</span>
            </div>
            <div className="flex-shrink-0">
              Modified: {formatDate(skill.last_modified)}
            </div>
          </div>

          {skill.allowed_tools && skill.allowed_tools.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {skill.allowed_tools.map((tool) => (
                <Badge key={tool} variant="secondary" className="text-xs">
                  {tool}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </Card>
    </motion.div>
  );

  return (
    <div className={cn("space-y-6", className)}>
      <div>
        <h2 className="text-2xl font-bold">Agent Skills</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your Claude Code skills for automating common tasks
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="personal" className="flex items-center gap-2">
            <User className="h-4 w-4" />
            Personal Skills
          </TabsTrigger>
          <TabsTrigger value="project" className="flex items-center gap-2">
            <Package className="h-4 w-4" />
            Project Skills
          </TabsTrigger>
        </TabsList>

        <TabsContent value="personal" className="mt-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : personalSkills.length === 0 ? (
            <Card className="p-12 text-center">
              <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No personal skills yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Create your first skill to automate common tasks
              </p>
              <Button onClick={() => {
                setCreateSkillType("personal");
                setCreateModalOpen(true);
              }}>
                <Plus className="mr-2 h-4 w-4" />
                Create Skill
              </Button>
            </Card>
          ) : (
            <div className="grid gap-4">
              <AnimatePresence>
                {personalSkills.map(renderSkillCard)}
              </AnimatePresence>
            </div>
          )}
        </TabsContent>

        <TabsContent value="project" className="mt-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : projectSkills.length === 0 ? (
            <Card className="p-12 text-center">
              <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No project skills yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Create project-specific skills to share with your team
              </p>
              <Button onClick={() => {
                setCreateSkillType("project");
                setCreateModalOpen(true);
              }}>
                <Plus className="mr-2 h-4 w-4" />
                Create Skill
              </Button>
            </Card>
          ) : (
            <div className="grid gap-4">
              <AnimatePresence>
                {projectSkills.map(renderSkillCard)}
              </AnimatePresence>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <CreateSkillModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onSave={handleCreateSkill}
        skillType={createSkillType}
      />

      <CreateSkillModal
        isOpen={editModalOpen}
        onClose={() => {
          setEditModalOpen(false);
          setEditSkill(null);
        }}
        onSave={handleUpdateSkill}
        skillType={editSkill?.skill_type as "personal" | "project"}
        initialData={editSkill || undefined}
        title="Edit Skill"
      />
    </div>
  );
};
