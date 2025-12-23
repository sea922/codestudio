import React, { useState, useEffect, useMemo } from 'react';
import { Minus, Square, X, Maximize2 } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { api } from '@/lib/api';
import { detectOS, osToWindowControlStyle } from '@/lib/osDetector';

export type WindowControlStyle = 'macos' | 'windows' | 'linux';

interface WindowControlsProps {
  style?: WindowControlStyle;
  position?: 'left' | 'right';
  className?: string;
}

export const WindowControls: React.FC<WindowControlsProps> = ({
  style,
  position = 'left',
  className = ''
}) => {
  // Detect OS and get default style
  const detectedOS = useMemo(() => detectOS(), []);
  const defaultStyle = useMemo(() => osToWindowControlStyle(detectedOS), [detectedOS]);
  
  const [controlStyle, setControlStyle] = useState<WindowControlStyle>(style || defaultStyle);
  const [isHovered, setIsHovered] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Load style from settings, fallback to auto-detected OS style
  useEffect(() => {
    const loadStyle = async () => {
      try {
        setIsLoading(true);
        const savedStyle = await api.getSetting('window_control_style');
        if (savedStyle && ['macos', 'windows', 'linux'].includes(savedStyle)) {
          // User has manually set a style, use it
          setControlStyle(savedStyle as WindowControlStyle);
        } else if (style) {
          // Style prop provided, use it
          setControlStyle(style);
        } else {
          // No saved style, use auto-detected OS style
          setControlStyle(defaultStyle);
        }
      } catch (error) {
        console.error('Failed to load window control style:', error);
        // Fallback to auto-detected OS style
        setControlStyle(defaultStyle);
      } finally {
        setIsLoading(false);
      }
    };
    loadStyle();
  }, [style, defaultStyle]);

  // Check if window is maximized
  useEffect(() => {
    const checkMaximized = async () => {
      try {
        const window = getCurrentWindow();
        const maximized = await window.isMaximized();
        setIsMaximized(maximized);
      } catch (error) {
        console.error('Failed to check window state:', error);
      }
    };
    checkMaximized();

    // Listen for maximize/unmaximize events
    const window = getCurrentWindow();
    const unlistenMaximize = window.onResized(() => {
      checkMaximized();
    });

    return () => {
      unlistenMaximize.then(fn => fn());
    };
  }, []);

  // Determine if this instance should render based on position and style
  const shouldRender = useMemo(() => {
    if (isLoading) return false;
    return (
      (controlStyle === 'macos' && position === 'left') ||
      ((controlStyle === 'windows' || controlStyle === 'linux') && position === 'right')
    );
  }, [controlStyle, position, isLoading]);

  const handleMinimize = async () => {
    try {
      const window = getCurrentWindow();
      await window.minimize();
    } catch (error) {
      console.error('Failed to minimize window:', error);
    }
  };

  const handleMaximize = async () => {
    try {
      const window = getCurrentWindow();
      if (isMaximized) {
        await window.unmaximize();
      } else {
        await window.maximize();
      }
    } catch (error) {
      console.error('Failed to maximize/unmaximize window:', error);
    }
  };

  const handleClose = async () => {
    try {
      const window = getCurrentWindow();
      await window.close();
    } catch (error) {
      console.error('Failed to close window:', error);
    }
  };

  // Don't render anything if this instance shouldn't be displayed
  if (!shouldRender) {
    return null;
  }

  // macOS style (circular buttons, left side)
  if (controlStyle === 'macos') {
    return (
      <div 
        className={`flex items-center space-x-2 pl-5 ${className}`}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleClose();
          }}
          className="group relative w-3 h-3 rounded-full bg-red-500 hover:bg-red-600 transition-all duration-200 flex items-center justify-center tauri-no-drag"
          title="Close"
        >
          {isHovered && (
            <X size={8} className="text-red-900 opacity-60 group-hover:opacity-100" />
          )}
        </button>

        <button
          onClick={(e) => {
            e.stopPropagation();
            handleMinimize();
          }}
          className="group relative w-3 h-3 rounded-full bg-yellow-500 hover:bg-yellow-600 transition-all duration-200 flex items-center justify-center tauri-no-drag"
          title="Minimize"
        >
          {isHovered && (
            <Minus size={8} className="text-yellow-900 opacity-60 group-hover:opacity-100" />
          )}
        </button>

        <button
          onClick={(e) => {
            e.stopPropagation();
            handleMaximize();
          }}
          className="group relative w-3 h-3 rounded-full bg-green-500 hover:bg-green-600 transition-all duration-200 flex items-center justify-center tauri-no-drag"
          title="Maximize"
        >
          {isHovered && (
            <Square size={6} className="text-green-900 opacity-60 group-hover:opacity-100" />
          )}
        </button>
      </div>
    );
  }

  // Windows style (square buttons, right side, order: minimize, maximize, close)
  if (controlStyle === 'windows') {
    return (
      <div 
        className={`flex items-center ${className}`}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleMinimize();
          }}
          className="group w-11 h-11 flex items-center justify-center hover:bg-accent transition-colors tauri-no-drag"
          title="Minimize"
        >
          <Minus size={12} className="text-foreground/70 group-hover:text-foreground" />
        </button>

        <button
          onClick={(e) => {
            e.stopPropagation();
            handleMaximize();
          }}
          className="group w-11 h-11 flex items-center justify-center hover:bg-accent transition-colors tauri-no-drag"
          title={isMaximized ? "Restore" : "Maximize"}
        >
          {isMaximized ? (
            <Maximize2 size={10} className="text-foreground/70 group-hover:text-foreground" />
          ) : (
            <Square size={10} className="text-foreground/70 group-hover:text-foreground" />
          )}
        </button>

        <button
          onClick={(e) => {
            e.stopPropagation();
            handleClose();
          }}
          className="group w-11 h-11 flex items-center justify-center hover:bg-destructive hover:text-destructive-foreground transition-colors tauri-no-drag"
          title="Close"
        >
          <X size={12} className="text-foreground/70 group-hover:text-destructive-foreground" />
        </button>
      </div>
    );
  }

  // Linux style (rounded square buttons, right side, similar to Windows but with rounded corners)
  return (
    <div 
      className={`flex items-center gap-1 ${className}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          handleMinimize();
        }}
        className="group w-10 h-10 rounded-md flex items-center justify-center hover:bg-accent transition-colors tauri-no-drag"
        title="Minimize"
      >
        <Minus size={12} className="text-foreground/70 group-hover:text-foreground" />
      </button>

      <button
        onClick={(e) => {
          e.stopPropagation();
          handleMaximize();
        }}
        className="group w-10 h-10 rounded-md flex items-center justify-center hover:bg-accent transition-colors tauri-no-drag"
        title={isMaximized ? "Restore" : "Maximize"}
      >
        {isMaximized ? (
          <Maximize2 size={10} className="text-foreground/70 group-hover:text-foreground" />
        ) : (
          <Square size={10} className="text-foreground/70 group-hover:text-foreground" />
        )}
      </button>

      <button
        onClick={(e) => {
          e.stopPropagation();
          handleClose();
        }}
        className="group w-10 h-10 rounded-md flex items-center justify-center hover:bg-destructive hover:text-destructive-foreground transition-colors tauri-no-drag"
        title="Close"
      >
        <X size={12} className="text-foreground/70 group-hover:text-destructive-foreground" />
      </button>
    </div>
  );
};
