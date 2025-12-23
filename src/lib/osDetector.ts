/**
 * Operating System Detection Utility
 * Detects the current operating system type
 */

export type OSType = 'windows' | 'macos' | 'linux' | 'unknown';

/**
 * Detects the current operating system
 * @returns The detected OS type
 */
export function detectOS(): OSType {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return 'unknown';
  }

  const platform = navigator.platform?.toLowerCase() || '';
  const userAgent = navigator.userAgent?.toLowerCase() || '';

  // Check for Windows
  if (
    platform.includes('win') ||
    userAgent.includes('windows') ||
    userAgent.includes('win32') ||
    userAgent.includes('win64')
  ) {
    return 'windows';
  }

  // Check for macOS
  if (
    platform.includes('mac') ||
    userAgent.includes('mac os x') ||
    userAgent.includes('macintosh')
  ) {
    return 'macos';
  }

  // Check for Linux
  if (
    platform.includes('linux') ||
    userAgent.includes('linux') ||
    (!platform.includes('win') && !platform.includes('mac'))
  ) {
    return 'linux';
  }

  return 'unknown';
}

/**
 * Maps OS type to window control style
 * @param os The OS type
 * @returns The corresponding window control style
 */
export function osToWindowControlStyle(os: OSType): 'macos' | 'windows' | 'linux' {
  switch (os) {
    case 'macos':
      return 'macos';
    case 'windows':
      return 'windows';
    case 'linux':
      return 'linux';
    default:
      // Default to macOS style for unknown OS
      return 'macos';
  }
}

