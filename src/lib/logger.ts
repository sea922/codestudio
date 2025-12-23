/**
 * Unified logging utility for the Opcode frontend
 *
 * This module provides a centralized logging system that:
 * - Controls log output based on environment (dev/prod)
 * - Supports different log levels
 * - Provides structured logging capabilities
 * - Helps with debugging and monitoring
 */

// Log levels in order of severity
export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
  TRACE = 4,
}

// Current log level (can be changed at runtime)
let currentLogLevel = LogLevel.INFO;

// Determine if we're in development mode
const isDevelopment = import.meta.env.DEV;

/**
 * Set the global log level
 */
export function setLogLevel(level: LogLevel): void {
  currentLogLevel = level;
}

/**
 * Get the current log level
 */
export function getLogLevel(): LogLevel {
  return currentLogLevel;
}

/**
 * Internal method to check if a log level should be output
 */
function shouldLog(level: LogLevel): boolean {
  // Always allow ERROR and WARN in production
  if (level <= LogLevel.WARN) {
    return true;
  }

  // In development, respect the log level
  // In production, only allow ERROR and WARN
  return isDevelopment && level <= currentLogLevel;
}

/**
 * Format log message with timestamp and context
 */
function formatMessage(message: string, ...args: any[]): string {
  const timestamp = new Date().toISOString();
  const formattedArgs = args.length > 0 ? ' ' + JSON.stringify(args) : '';
  return `[${timestamp}] ${message}${formattedArgs}`;
}

/**
 * Log an ERROR message
 */
export function error(message: string, ...args: any[]): void {
  if (shouldLog(LogLevel.ERROR)) {
    console.error(formatMessage(`❌ ERROR: ${message}`, ...args));
  }
}

/**
 * Log a WARN message
 */
export function warn(message: string, ...args: any[]): void {
  if (shouldLog(LogLevel.WARN)) {
    console.warn(formatMessage(`⚠️  WARN: ${message}`, ...args));
  }
}

/**
 * Log an INFO message
 */
export function info(message: string, ...args: any[]): void {
  if (shouldLog(LogLevel.INFO)) {
    console.info(formatMessage(`ℹ️  INFO: ${message}`, ...args));
  }
}

/**
 * Log a DEBUG message (only in development)
 */
export function debug(message: string, ...args: any[]): void {
  if (shouldLog(LogLevel.DEBUG)) {
    console.debug(formatMessage(`🔍 DEBUG: ${message}`, ...args));
  }
}

/**
 * Log a TRACE message (only in development)
 */
export function trace(message: string, ...args: any[]): void {
  if (shouldLog(LogLevel.TRACE)) {
    console.trace(formatMessage(`🔎 TRACE: ${message}`, ...args));
  }
}

/**
 * Log performance metrics
 */
export function performance(label: string, duration: number): void {
  if (shouldLog(LogLevel.INFO)) {
    console.info(formatMessage(`⏱️  PERFORMANCE: ${label} took ${duration.toFixed(2)}ms`));
  }
}

/**
 * Create a scoped logger with a prefix
 */
export function createScopedLogger(scope: string) {
  return {
    error: (message: string, ...args: any[]) => error(`[${scope}] ${message}`, ...args),
    warn: (message: string, ...args: any[]) => warn(`[${scope}] ${message}`, ...args),
    info: (message: string, ...args: any[]) => info(`[${scope}] ${message}`, ...args),
    debug: (message: string, ...args: any[]) => debug(`[${scope}] ${message}`, ...args),
    trace: (message: string, ...args: any[]) => trace(`[${scope}] ${message}`, ...args),
    performance: (label: string, duration: number) => performance(`[${scope}] ${label}`, duration),
  };
}

// Export default object for convenience
export default {
  error,
  warn,
  info,
  debug,
  trace,
  performance,
  createScopedLogger,
  setLogLevel,
  getLogLevel,
  LogLevel,
};
