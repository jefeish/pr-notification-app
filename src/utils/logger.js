/**
 * @fileoverview Logging and Error Handling Utilities
 * @description Provides centralized logging functionality using Probot's built-in
 * Pino logger. Supports structured logging, proper log levels, and both console
 * and file output through Probot's logging infrastructure.
 * 
 * @author Jürgen Efeish
 * 
 * @module Logger
 * 
 * @example
 * // Initialize logger with Probot app instance
 * Logger.init(app);
 * 
 * @example
 * // Basic logging
 * Logger.info('Application started', { component: 'main' });
 * Logger.error('Failed to process', { error: error.message, userId: 123 });
 * 
 * @example
 * // Error handling with async operations
 * const result = await ErrorHandler.handleAsync(
 *   async () => await riskyOperation(),
 *   { operation: 'user-creation' }
 * );
 */

/**
 * @class Logger
 * @description Centralized logging utility using Probot's Pino-based logger.
 * Provides proper log levels, structured logging, and integrates with Probot's
 * logging infrastructure for consistent application-wide logging.
 */
export class Logger {
  static #logger = null;
  static #fallbackLogger = console;
  static #auditLogger = null;

  /**
   * Initialize logger with Probot app instance
   * @param {Object} app - Probot application instance with logger
   */
  static async init(app) {
    if (app && app.log) {
      this.#logger = app.log;
    }
    await this.#initAuditLogger();
  }

  /**
   * Initialize audit logger for file-based logging
   */
  static async #initAuditLogger() {
    try {
      const fs = await import('fs');
      const path = await import('path');
      
      // Create logs directory if it doesn't exist
      const logsDir = 'logs';
      if (!fs.default.existsSync(logsDir)) {
        fs.default.mkdirSync(logsDir, { recursive: true });
      }

      const auditLogPath = path.default.join(logsDir, 'audit.log');
      
      // Create a simple audit logger
      this.#auditLogger = {
        write: (message) => {
          const timestamp = new Date().toISOString();
          const logEntry = `${timestamp} - ${message}\n`;
          fs.default.appendFileSync(auditLogPath, logEntry, 'utf8');
        }
      };
      
      this.info('Audit logging initialized', { auditLogPath });
    } catch (error) {
      this.warn('Failed to initialize audit logging', { error: error.message });
    }
  }

  /**
   * Get the active logger (Probot logger or fallback to console)
   */
  static #getLogger() {
    return this.#logger || this.#fallbackLogger;
  }

  /**
   * Write to audit log file
   */
  static #writeToAuditLog(level, message, context = {}) {
    if (this.#auditLogger) {
      const contextStr = Object.keys(context).length > 0 ? ` ${JSON.stringify(context)}` : '';
      const auditEntry = `[${level.toUpperCase()}] ${message}${contextStr}`;
      this.#auditLogger.write(auditEntry);
    }
  }

  /**
   * Info level logging
   * @param {string} message - Log message
   * @param {Object} context - Additional context data
   */
  static info(message, context = {}) {
    const logger = this.#getLogger();
    if (logger.info) {
      logger.info(context, message);
    } else {
      logger.log(`[INFO] ${message}`, context);
    }
    this.#writeToAuditLog('info', message, context);
  }

  /**
   * Error level logging
   * @param {string} message - Log message
   * @param {Error|null} error - Error object
   * @param {Object} context - Additional context data
   */
  static error(message, error = null, context = {}) {
    const logger = this.#getLogger();
    const errorContext = {
      ...context,
      ...(error && {
        error: error.message,
        stack: error.stack,
        name: error.name
      })
    };

    if (logger.error) {
      logger.error(errorContext, message);
    } else {
      logger.error(`[ERROR] ${message}`, errorContext);
    }
    this.#writeToAuditLog('error', message, errorContext);
  }

  /**
   * Debug level logging
   * @param {string} message - Log message
   * @param {Object} context - Additional context data
   */
  static debug(message, context = {}) {
    const logger = this.#getLogger();
    if (logger.debug) {
      logger.debug(context, message);
    } else {
      logger.log(`[DEBUG] ${message}`, context);
    }
    this.#writeToAuditLog('debug', message, context);
  }

  /**
   * Trace level logging (most verbose)
   * @param {string} message - Log message
   * @param {Object} context - Additional context data
   */
  static trace(message, context = {}) {
    const logger = this.#getLogger();
    if (logger.trace) {
      logger.trace(context, message);
    } else if (logger.debug) {
      logger.debug(context, `[TRACE] ${message}`);
    } else {
      logger.log(`[TRACE] ${message}`, context);
    }
    this.#writeToAuditLog('trace', message, context);
  }

  /**
   * Warning level logging
   * @param {string} message - Log message
   * @param {Object} context - Additional context data
   */
  static warn(message, context = {}) {
    const logger = this.#getLogger();
    if (logger.warn) {
      logger.warn(context, message);
    } else {
      logger.warn(`[WARN] ${message}`, context);
    }
    this.#writeToAuditLog('warn', message, context);
  }

  /**
   * Audit logging - writes to audit.log file
   * @param {string} event - Event type (e.g., 'EMAIL_SENT', 'WEBHOOK_RECEIVED')
   * @param {Object} data - Event data to log
   */
  static audit(event, data = {}) {
    // Use regular info logging which will automatically go to audit.log
    this.info(`AUDIT: ${event}`, data);
  }

  /**
   * Log with app context for better debugging (maintained for backward compatibility)
   * @param {Object} app - Probot app instance
   * @param {string} level - Log level
   * @param {string} message - Log message
   * @param {Object} context - Additional context data
   */
  static appLog(app, level, message, context = {}) {
    if (app && app.log && app.log[level]) {
      app.log[level](context, message);
    } else {
      this[level](message, context);
    }
  }
}

/**
 * Error handling utility
 */
export class ErrorHandler {
  static async handle(error, context = {}, app = null) {
    Logger.error('Application error occurred', error, context);
    
    if (app) {
      Logger.appLog(app, 'error', `Error in ${context.operation || 'unknown operation'}`, {
        error: error.message,
        context
      });
    }
    
    return {
      success: false,
      error: error.message,
      context
    };
  }

  static async handleAsync(asyncOperation, context = {}, app = null) {
    try {
      const result = await asyncOperation();
      return { success: true, result };
    } catch (error) {
      return await this.handle(error, context, app);
    }
  }
}