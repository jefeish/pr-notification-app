/**
 * @fileoverview Base Event Handler Classes and Factory
 * @description Provides base classes and factory pattern implementation for GitHub
 * webhook event handlers. Establishes common interface and utilities for all
 * event-specific handlers with extensible architecture.
 * 
 * @author Jürgen Efeish
 * 
 * @module BaseHandler
 * 
 * @requires Logger - Logging utility
 * @requires StatusFormatter - Status formatting utilities
 * 
 * @example
 * // Extend base handler for custom events
 * class MyEventHandler extends BaseHandler {
 *   async handle(context, action) {
 *     Logger.info(`WEBHOOK RECEIVED: my_event.${action}`);
 *     // Handle event logic
 *     return { success: true };
 *   }
 * }
 * 
 * @example
 * // Register handler with factory
 * EventHandlerFactory.register('my_event', MyEventHandler);
 * 
 * @example
 * // Create handler instance
 * const handler = EventHandlerFactory.createHandler('pull_request', notificationService);
 * const result = await handler.handle(context, 'opened');
 */

import { Logger } from '../utils/logger.js';
import { StatusFormatter } from '../utils/validators.js';

/**
 * @abstract
 * @class BaseHandler
 * @description Abstract base handler class for all event handlers.
 * Provides common functionality and interface that all event handlers must implement.
 */
export class BaseHandler {
  constructor(notificationService) {
    this.notificationService = notificationService;
  }

  /**
   * Handle an event - must be implemented by subclasses
   */
  async handle(context, action) {
    throw new Error('Handle method must be implemented by subclass');
  }

  /**
   * Create notification data object
   */
  createNotificationData(subject, description, detailsUrl, statusInfo, summary = null) {
    return {
      subject,
      description,
      detailsUrl,
      statusInfo,
      summary
    };
  }
}

/**
 * Handler for events that don't have specific handlers
 */
export class DefaultHandler extends BaseHandler {
  async handle(context, action) {
    Logger.warn(`No specific handler for event ${context.name}.${action}`);
    return { success: false, reason: 'No handler available' };
  }
}

/**
 * Factory for creating appropriate event handlers
 */
export class EventHandlerFactory {
  static handlers = new Map();

  /**
   * Register a handler for an event type
   */
  static register(eventType, handlerClass) {
    this.handlers.set(eventType, handlerClass);
  }

  /**
   * Create handler for an event type
   */
  static createHandler(eventType, notificationService) {
    const HandlerClass = this.handlers.get(eventType) || DefaultHandler;
    return new HandlerClass(notificationService);
  }

  /**
   * Get all registered event types
   */
  static getRegisteredEvents() {
    return Array.from(this.handlers.keys());
  }
}