/**
 * @fileoverview Main application entry point for PR Notification App
 * @description This file serves as the main entry point for the refactored PR notification application.
 * It initializes the dependency injection container, registers event handlers, and sets up the
 * complete application architecture with proper separation of concerns.
 * 
 * @author Jürgen Efeish
 * 
 * @requires EmailService - Service for handling email notifications
 * @requires GitHubService - Service for GitHub API interactions
 * @requires NotificationService - Core notification orchestration service
 * @requires EventHandlerFactory - Factory for creating event-specific handlers
 * @requires PullRequestHandler - Handler for pull request events
 * @requires Logger - Centralized logging utility
 * @requires AppConfig - Application configuration management
 * 
 * @example
 * // Usage with Probot
 * export default (app) => {
 *   const notificationApp = new NotificationApp(app);
 *   notificationApp.initialize();
 * };
 */

import { EmailService } from './services/emailService.js';
import { GitHubService } from './services/githubService.js';
import { NotificationService } from './services/notificationService.js';
import { EventHandlerFactory, BaseHandler } from './handlers/baseHandler.js';
import { PullRequestHandler } from './handlers/pullRequestHandler.js';
import { CheckRunHandler } from './handlers/checkRunHandler.js';
import { DeploymentHandler } from './handlers/deploymentHandler.js';
import { Logger } from './utils/logger.js';
import { AppConfig } from './config/appConfig.js';

/**
 * Application container for dependency injection and service management
 */
class AppContainer {
  constructor(app) {
    this.app = app;
    this.services = new Map();
    this.initialized = false;
  }

  /**
   * Initialize all services
   */
  initialize() {
    if (this.initialized) return;

    // Initialize services
    this.services.set('emailService', new EmailService());
    this.services.set('githubService', new GitHubService(this.app));
    this.services.set('notificationService', new NotificationService(
      this.get('emailService'),
      this.get('githubService'),
      this.app
    ));

    // Register event handlers
    EventHandlerFactory.register('pull_request', PullRequestHandler);
    EventHandlerFactory.register('pull_request_review', PullRequestHandler);
    EventHandlerFactory.register('check_run', CheckRunHandler);
    EventHandlerFactory.register('deployment', DeploymentHandler);
    EventHandlerFactory.register('deployment_status', DeploymentHandler);
    // Additional handlers will be registered here as they're created

    this.initialized = true;
    Logger.info('Application container initialized');
  }

  /**
   * Get a service by name
   */
  get(serviceName) {
    const service = this.services.get(serviceName);
    if (!service) {
      throw new Error(`Service ${serviceName} not found`);
    }
    return service;
  }

  /**
   * Get application health status
   */
  getHealthStatus() {
    return this.get('notificationService').getHealthStatus();
  }
}

/**
 * Main application class
 */
class NotificationApp {
  constructor(app) {
    this.app = app;
    this.container = new AppContainer(app);
  }

  /**
   * Initialize the application
   */
  async initialize() {
    // Initialize logger with Probot app instance first
    await Logger.init(this.app);
    
    this.container.initialize();
    this.validateConfiguration();
    this.registerEventHandlers();
    this.logStartupInfo();
  }

  /**
   * Validate application configuration
   */
  validateConfiguration() {
    const errors = AppConfig.validate();
    const emailService = this.container.get('emailService');
    
    // Handle SMTP configuration status
    if (!emailService.isConfigured()) {
      Logger.warn('🔧 SMTP not configured - Email notifications will be mocked/logged only');
      Logger.info('📧 To enable real emails, set: SMTP_HOST, SMTP_USER, SMTP_PASS environment variables');
    } else {
      Logger.info('📧 SMTP configured - Email notifications enabled');
      
      // Additional validation warnings
      if (errors.length > 0) {
        Logger.warn('Configuration validation warnings:', errors);
      }
      emailService.testConfiguration().then(result => {
        if (result.success) {
          Logger.info('Email configuration validated successfully');
        } else {
          Logger.error('Email configuration validation failed', result.error);
        }
      });
    }
  }

  /**
   * Register all event handlers
   */
  registerEventHandlers() {
    const notificationService = this.container.get('notificationService');

    // Pull Request Events
    this.app.on("pull_request.opened", (context) => this.handleEvent(context, 'pull_request', 'opened'));
    this.app.on("pull_request.closed", (context) => this.handleEvent(context, 'pull_request', 'closed'));
    this.app.on("pull_request.edited", (context) => this.handleEvent(context, 'pull_request', 'edited'));
    this.app.on("pull_request.reopened", (context) => this.handleEvent(context, 'pull_request', 'reopened'));
    this.app.on("pull_request.synchronize", (context) => this.handleEvent(context, 'pull_request', 'synchronize'));
    this.app.on("pull_request.ready_for_review", (context) => this.handleEvent(context, 'pull_request', 'ready_for_review'));
    this.app.on("pull_request.review_requested", (context) => this.handleEvent(context, 'pull_request', 'review_requested'));

        // Check Run Events  
    this.app.on("check_run.completed", (context) => this.handleEvent(context, 'check_run', 'completed'));
    // this.app.on("check_run.created", (context) => this.handleEvent(context, 'check_run', 'created'));
    
    // Pull Request Review Events
    this.app.on("pull_request_review.submitted", (context) => this.handleEvent(context, 'pull_request_review', 'submitted'));
    
    // Deployment Events
    this.app.on("deployment", (context) => this.handleEvent(context, 'deployment', context.payload.action || 'created'));
    this.app.on("deployment_status", (context) => this.handleEvent(context, 'deployment_status', context.payload.deployment_status?.state || 'unknown'));

    // Keep original issues handler for backward compatibility
    this.app.on("issues.opened", async (context) => {
      const issueComment = context.issue({
        body: "Thanks for opening this issue!",
      });
      return context.octokit.issues.createComment(issueComment);
    });

    // Add a catch-all webhook listener for debugging
    this.app.webhooks.onAny((context) => {
      Logger.debug(`🔔 WEBHOOK RECEIVED: ${context.name}.${context.payload.action}`);
      Logger.audit('WEBHOOK_RECEIVED', {
        event: context.name,
        action: context.payload.action,
        repository: context.payload.repository?.full_name,
        sender: context.payload.sender?.login
      });
    });

    Logger.info('Event handlers registered');
  }

  /**
   * Handle incoming events
   */
  async handleEvent(context, eventType, action) {
    try {
      const payloadEntries = Object.keys(context.payload).reduce((acc, key) => {
        const value = context.payload[key];
        if (typeof value === 'object' && value !== null) {
          // Make objects more readable by showing key properties
          if (key === 'pull_request') {
            acc[key] = `#${value.number} - ${value.title}`;
          } else if (key === 'repository') {
            acc[key] = value.full_name || value.name;
          } else if (key === 'sender') {
            acc[key] = value.login;
          } else if (key === 'organization') {
            acc[key] = value.login;
          } else if (key === 'enterprise') {
            acc[key] = value.name || value.slug || `enterprise-${value.id}`;
          } else if (key === 'installation') {
            acc[key] = `app-${value.id} (${value.app_slug || 'unknown'})`;
          } else {
            acc[key] = `[object ${value.constructor.name}]`;
          }
        } else {
          acc[key] = value;
        }
        return acc;
      }, {});
      Logger.debug('Event context payload:', payloadEntries);
      
      const notificationService = this.container.get('notificationService');
      const handler = EventHandlerFactory.createHandler(eventType, notificationService);
      
      Logger.info(`📡 Processing ${eventType}.${action} with handler: ${handler.constructor.name}`);
      
      const result = await handler.handle(context, action);
      
      if (!result.success) {
        Logger.warn(`Event handling failed for ${eventType}.${action}: ${result.reason}`);
      } else {
        Logger.info(`✅ Successfully processed ${eventType}.${action}`);
      }
      
      return result;
    } catch (error) {
      Logger.error(`Error handling event ${eventType}.${action}`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Log startup information
   */
  logStartupInfo() {
    Logger.info(" PR NOTIFICATION APP INITIALIZATION ");
    
    const healthStatus = this.container.getHealthStatus();
    
    // Log configuration status
    Logger.info(`SMTP configuration: ${healthStatus.email.configured ? 'configured' : 'not configured'}`);
    
    if (healthStatus.email.configured) {
      Logger.debug(`SMTP Host: ${healthStatus.email.host}:${healthStatus.email.port}, Secure: ${healthStatus.email.secure}`);
      Logger.debug(`SMTP Auth User: ${healthStatus.email.hasCredentials ? 'configured' : 'not configured'}`);
    }
    
    // Log enabled events
    if (healthStatus.enabledEvents.length > 0) {
      Logger.info(`Enabled events (${healthStatus.enabledEvents.length}): ${healthStatus.enabledEvents.join(', ')}`);
    } else {
      Logger.warn('No events explicitly enabled via environment variables');
    }
    
    // Log registered handlers
    const registeredEvents = EventHandlerFactory.getRegisteredEvents();
    Logger.info(`Registered handlers: ${registeredEvents.join(', ')}`);
    
    Logger.info(" APP INITIALIZATION COMPLETE  ");
  }

  /**
   * Get application container
   */
  getContainer() {
    return this.container;
  }
}

/**
 * Main entry point - Probot app function
 */
export default async (app) => {
  app.log.info("PR notification app loaded!");
  app.log.debug('Application starting with debug logging enabled');
  const notificationApp = new NotificationApp(app);
  await notificationApp.initialize();
  
  // Make container available for testing/debugging
  app.notificationApp = notificationApp;
};