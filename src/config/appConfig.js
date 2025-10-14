/**
 * @fileoverview Application Configuration Management
 * @description Centralized configuration management system for the PR notification app.
 * Handles all environment variable access, validation, and provides structured
 * configuration objects for different subsystems (email, notifications, app settings).
 * 
 * @author Jürgen Efeish
 * 
 * 
 * @module AppConfig
 * 
 * @example
 * // Get email configuration
 * const emailConfig = AppConfig.email;
 * 
 * @example
 * // Check if event is enabled
 * const isEnabled = AppConfig.isEventEnabled('pull_request', 'opened');
 * 
 * @example
 * // Validate configuration
 * const errors = AppConfig.validate();
 * if (errors.length > 0) {
 *   console.warn('Configuration issues:', errors);
 * }
 */

import { Logger } from '../utils/logger.js';

/**
 * @class AppConfig
 * @description Centralized application configuration management class.
 * Provides static methods and properties for accessing configuration values
 * from environment variables with appropriate defaults and validation.
 */
export class AppConfig {
  /**
   * @static
   * @readonly
   * @memberof AppConfig
   * @description Email configuration object with SMTP settings from environment variables
   * 
   * @returns {Object} Email configuration object
   * @property {string} host - SMTP server hostname
   * @property {number} port - SMTP server port
   * @property {boolean} secure - Whether to use secure connection
   * @property {string|undefined} user - SMTP username
   * @property {string|undefined} pass - SMTP password
   * @property {string} from - From email address
   * 
   * @example
   * const emailConfig = AppConfig.email;
   * console.log(`SMTP: ${emailConfig.host}:${emailConfig.port}`);
   */
  static get email() {
    return {
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
      from: process.env.SMTP_FROM || process.env.SMTP_USER
    };
  }

  /**
   * Notification configuration
   */
  static get notifications() {
    return {
      debugWorkflow: process.env.DEBUG_WORKFLOW_STEPS === 'true',
      // Additional recipients configuration
      additionalRecipients: this.getAdditionalRecipients()
    };
  }

  /**
   * Get additional recipients from environment variables
   * Supports both email addresses and GitHub usernames
   */
  static getAdditionalRecipients() {
    const recipients = {
      emails: [],
      usernames: []
    };

    // Parse additional email recipients
    const additionalEmails = process.env.ADDITIONAL_RECIPIENT_EMAILS;
    if (additionalEmails) {
      recipients.emails = additionalEmails.split(',').map(email => email.trim()).filter(email => email.length > 0);
    }

    // Parse additional GitHub usernames 
    const additionalUsernames = process.env.ADDITIONAL_RECIPIENT_USERNAMES;
    if (additionalUsernames) {
      recipients.usernames = additionalUsernames.split(',').map(username => username.trim()).filter(username => username.length > 0);
    }

    return recipients;
  }

  /**
   * Application configuration
   */
  static get app() {
    return {
      nodeEnv: process.env.NODE_ENV || 'development',
      debug: process.env.DEBUG === 'true',
      logLevel: process.env.LOG_LEVEL || 'info'
    };
  }

  /**
   * @static
   * @memberof AppConfig
   * @description Check if a specific event type and action is enabled via environment variables
   * 
   * @param {string} eventType - The GitHub event type (e.g., 'pull_request')
   * @param {string|null} [action=null] - The specific action (e.g., 'opened')
   * @returns {boolean} True if notifications should be sent
   */
  static isEventEnabled(eventType, action = null) {
    // PR lifecycle events: opened, closed, reopened
    if (eventType === 'pull_request' && ['opened', 'closed', 'reopened'].includes(action)) {
      return process.env.NOTIFY_PR_LIFECYCLE === 'true';
    }
    
    // PR review events: review submitted, dismissed  
    if (eventType === 'pull_request_review' && ['submitted', 'dismissed'].includes(action)) {
      return process.env.NOTIFY_PR_REVIEWS === 'true';
    }
    
    // PR comments
    if ((eventType === 'issue_comment' && action === 'created') || 
        (eventType === 'pull_request_review_comment' && action === 'created')) {
      return process.env.NOTIFY_PR_COMMENTS === 'true';
    }
    
    // CI/CD check results
    if ((eventType === 'check_run' && action === 'completed') ||
        (eventType === 'check_suite' && action === 'completed')) {
      return process.env.NOTIFY_CHECK_RESULTS === 'true';
    }
    
    // PR updates: synchronize (new commits), edits
    if (eventType === 'pull_request' && ['synchronize', 'edited', 'ready_for_review', 'review_requested'].includes(action)) {
      return process.env.NOTIFY_PR_UPDATES === 'true';
    }
    
    // Deployment events
    if (eventType === 'deployment' || eventType === 'deployment_status') {
      return process.env.NOTIFY_DEPLOYMENTS === 'true';
    }
    
    // Default: disabled for unrecognized events
    Logger.debug(`Event ${eventType}.${action} not configured - defaulting to disabled`);
    return false;
  }

  /**
   * Validate configuration
   */
  static validate() {
    const errors = [];

    if (!this.email.user || !this.email.pass) {
      errors.push('SMTP credentials (SMTP_USER, SMTP_PASS) are required for email notifications');
    }

    return errors;
  }

  /**
   * Get all enabled notification categories for logging
   */
  static getEnabledEvents() {
    const enabledCategories = [];
    Object.keys(process.env).forEach(key => {
      if (key.startsWith('NOTIFY_') && process.env[key] === 'true') {
        enabledCategories.push(key.replace('NOTIFY_', ''));
      }
    });
    return enabledCategories;
  }
}