import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Settings, Bot, BarChart3, FileText, Network, Info, MoreVertical } from 'lucide-react';
import { TooltipProvider, TooltipSimple } from '@/components/ui/tooltip-modern';
import { WindowControls } from '@/components/WindowControls';
import { detectOS, osToWindowControlStyle } from '@/lib/osDetector';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface CustomTitlebarProps {
  onSettingsClick?: () => void;
  onAgentsClick?: () => void;
  onUsageClick?: () => void;
  onClaudeClick?: () => void;
  onMCPClick?: () => void;
  onInfoClick?: () => void;
}

export const CustomTitlebar: React.FC<CustomTitlebarProps> = ({
  onSettingsClick,
  onAgentsClick,
  onUsageClick,
  onClaudeClick,
  onMCPClick,
  onInfoClick
}) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [windowControlStyle, setWindowControlStyle] = useState<'macos' | 'windows' | 'linux'>('macos');

  // Detect OS and load window control style
  useEffect(() => {
    const loadStyle = async () => {
      try {
        const detectedOS = detectOS();
        const defaultStyle = osToWindowControlStyle(detectedOS);
        const savedStyle = await api.getSetting('window_control_style');
        if (savedStyle && savedStyle.trim() !== '' && ['macos', 'windows', 'linux'].includes(savedStyle)) {
          setWindowControlStyle(savedStyle as 'macos' | 'windows' | 'linux');
        } else {
          setWindowControlStyle(defaultStyle);
        }
      } catch (error) {
        console.error('Failed to load window control style:', error);
        const detectedOS = detectOS();
        setWindowControlStyle(osToWindowControlStyle(detectedOS));
      }
    };
    loadStyle();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Determine if we should show navigation icons on the left (Windows/Linux style)
  const isWindowsOrLinuxStyle = windowControlStyle === 'windows' || windowControlStyle === 'linux';

  // Navigation icons component (reusable)
  const navigationIcons = (
    <>
      {/* Primary actions group */}
      <div className="flex items-center gap-1">
        {onAgentsClick && (
          <TooltipSimple content="Agents" side="bottom">
            <motion.button
              onClick={onAgentsClick}
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.15 }}
              className="p-2 rounded-md hover:bg-accent hover:text-accent-foreground transition-colors tauri-no-drag"
            >
              <Bot size={16} />
            </motion.button>
          </TooltipSimple>
        )}
        
        {onUsageClick && (
          <TooltipSimple content="Usage Dashboard" side="bottom">
            <motion.button
              onClick={onUsageClick}
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.15 }}
              className="p-2 rounded-md hover:bg-accent hover:text-accent-foreground transition-colors tauri-no-drag"
            >
              <BarChart3 size={16} />
            </motion.button>
          </TooltipSimple>
        )}
      </div>

      {/* Visual separator */}
      <div className="w-px h-5 bg-border/50" />

      {/* Secondary actions group */}
      <div className="flex items-center gap-1">
        {onSettingsClick && (
          <TooltipSimple content="Settings" side="bottom">
            <motion.button
              onClick={onSettingsClick}
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.15 }}
              className="p-2 rounded-md hover:bg-accent hover:text-accent-foreground transition-colors tauri-no-drag"
            >
              <Settings size={16} />
            </motion.button>
          </TooltipSimple>
        )}

        {/* Dropdown menu for additional options */}
        <div className="relative" ref={dropdownRef}>
          <TooltipSimple content="More options" side="bottom">
            <motion.button
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.15 }}
              className="p-2 rounded-md hover:bg-accent hover:text-accent-foreground transition-colors flex items-center gap-1"
            >
              <MoreVertical size={16} />
            </motion.button>
          </TooltipSimple>

          {isDropdownOpen && (
            <div 
              className={cn(
                "absolute mt-2 w-48 bg-popover border border-border rounded-lg shadow-lg z-[250]",
                isWindowsOrLinuxStyle ? "left-0" : "right-0"
              )}
            >
              <div className="py-1">
                {onClaudeClick && (
                  <button
                    onClick={() => {
                      onClaudeClick();
                      setIsDropdownOpen(false);
                    }}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground transition-colors flex items-center gap-3"
                  >
                    <FileText size={14} />
                    <span>CLAUDE.md</span>
                  </button>
                )}
                
                {onMCPClick && (
                  <button
                    onClick={() => {
                      onMCPClick();
                      setIsDropdownOpen(false);
                    }}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground transition-colors flex items-center gap-3"
                  >
                    <Network size={14} />
                    <span>MCP Servers</span>
                  </button>
                )}
                
                {onInfoClick && (
                  <button
                    onClick={() => {
                      onInfoClick();
                      setIsDropdownOpen(false);
                    }}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground transition-colors flex items-center gap-3"
                  >
                    <Info size={14} />
                    <span>About</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );

  return (
    <TooltipProvider>
    <div 
      className="relative z-[200] h-11 bg-background/95 backdrop-blur-sm flex items-center justify-between select-none border-b border-border/50 tauri-drag"
      data-tauri-drag-region
    >
      {/* Left side */}
      <div className="flex items-center gap-3 tauri-no-drag">
        {/* macOS: Window Controls on left */}
        {!isWindowsOrLinuxStyle && <WindowControls position="left" />}
        
        {/* Windows/Linux: Navigation icons on left */}
        {isWindowsOrLinuxStyle && (
          <div className="flex items-center gap-3 pl-2">
            {navigationIcons}
          </div>
        )}
      </div>

      {/* Center - Title (hidden) */}
      {/* <div 
        className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none"
        data-tauri-drag-region
      >
        <span className="text-sm font-medium text-foreground/80">{title}</span>
      </div> */}

      {/* Right side */}
      <div className="flex items-center gap-3 tauri-no-drag">
        {/* macOS: Navigation icons on right */}
        {!isWindowsOrLinuxStyle && (
          <div className="flex items-center gap-3 pr-2">
            {navigationIcons}
          </div>
        )}
        
        {/* Windows/Linux: Window Controls on right */}
        {isWindowsOrLinuxStyle && (
          <div className="pr-2">
            <WindowControls position="right" />
          </div>
        )}
      </div>
    </div>
    </TooltipProvider>
  );
};
