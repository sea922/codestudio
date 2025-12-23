import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Clock } from "lucide-react";
import { Pagination } from "@/components/ui/pagination";
import { ClaudeMemoriesDropdown } from "@/components/ClaudeMemoriesDropdown";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { truncateText, getFirstLine } from "@/lib/date-utils";
import type { Session, ClaudeMdFile } from "@/lib/api";

interface SessionListProps {
  /**
   * Array of sessions to display
   */
  sessions: Session[];
  /**
   * The current project path being viewed
   */
  projectPath: string;
  /**
   * Optional callback to go back to project list (deprecated - use tabs instead)
   */
  onBack?: () => void;
  /**
   * Callback when a session is clicked
   */
  onSessionClick?: (session: Session) => void;
  /**
   * Callback when a CLAUDE.md file should be edited
   */
  onEditClaudeFile?: (file: ClaudeMdFile) => void;
  /**
   * Optional className for styling
   */
  className?: string;
}

const ITEMS_PER_PAGE = 20;

/**
 * SessionList component - Displays paginated sessions for a specific project
 * 
 * @example
 * <SessionList
 *   sessions={sessions}
 *   projectPath="/Users/example/project"
 *   onBack={() => setSelectedProject(null)}
 *   onSessionClick={(session) => console.log('Selected session:', session)}
 * />
 */
export const SessionList: React.FC<SessionListProps> = ({
  sessions,
  projectPath,
  onSessionClick,
  onEditClaudeFile,
  className,
}) => {
  const [currentPage, setCurrentPage] = useState(1);
  
  // Calculate pagination
  const totalPages = Math.ceil(sessions.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const currentSessions = sessions.slice(startIndex, endIndex);
  
  // Reset to page 1 if sessions change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [sessions.length]);
  
  return (
    <TooltipProvider>
      <div className={cn("space-y-4", className)}>
      {/* CLAUDE.md Memories Dropdown */}
      {onEditClaudeFile && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <ClaudeMemoriesDropdown
            projectPath={projectPath}
            onEditFile={onEditClaudeFile}
          />
        </motion.div>
      )}

      <AnimatePresence mode="popLayout">
        <div className="space-y-2">
          {currentSessions.map((session, index) => (
            <motion.div
              key={session.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{
                duration: 0.2,
                delay: index * 0.02,
                ease: [0.4, 0, 0.2, 1],
              }}
            >
              <div
                className={cn(
                  "flex items-center gap-4 p-3 rounded-lg border hover:bg-accent/50 transition-all duration-200 cursor-pointer group",
                  session.todo_data && "bg-primary/5 border-primary/20"
                )}
                onClick={() => {
                  // Emit a special event for Claude Code session navigation
                  const event = new CustomEvent('claude-session-selected', { 
                    detail: { session, projectPath } 
                  });
                  window.dispatchEvent(event);
                  onSessionClick?.(session);
                }}
              >
                {/* Time */}
                <div className="flex items-center gap-2 min-w-[180px]">
                  <Clock className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-sm font-medium font-mono">
                    {session.last_message_timestamp 
                      ? new Date(session.last_message_timestamp).toLocaleString('zh-CN', { 
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                          hour12: false
                        })
                      : session.message_timestamp 
                        ? new Date(session.message_timestamp).toLocaleString('zh-CN', { 
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                            hour12: false
                          })
                        : new Date(session.created_at * 1000).toLocaleString('zh-CN', { 
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                            hour12: false
                          })
                    }
                  </span>
                </div>

                {/* First message preview */}
                <div className="flex-1 min-w-0">
                  {session.first_message ? (
                    <p className="text-sm text-muted-foreground truncate">
                      {truncateText(getFirstLine(session.first_message), 120)}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground/60 italic">
                      No messages yet
                    </p>
                  )}
                </div>

                {/* Session ID and badges */}
                <div className="flex items-center gap-2">
                  {session.todo_data && (
                    <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-primary/10 text-primary">
                      Todo
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground font-mono">
                    {session.id.slice(-8)}
                  </span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </AnimatePresence>
      
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
        />
      </div>
    </TooltipProvider>
  );
}; 