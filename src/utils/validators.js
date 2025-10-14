/**
 * @fileoverview Validation and Formatting Utilities
 * @description Provides validation logic for notifications, status formatting utilities,
 * and data formatting helpers. Contains business logic for determining notification
 * priorities, event processing rules, and display formatting.
 * 
 * @author Jürgen Efeish
 * 
 * 
 * @module Validators
 * 
 * @requires STATUS_MAPPINGS - Status display mappings
 * @requires EVENT_EMOJIS - Event emoji mappings
 * @requires AppConfig - Application configuration
 * @requires Logger - Logging utility
 * 
 * @example
 * // Check if notification should be sent
 * const shouldSend = NotificationValidator.shouldNotify('pull_request', 'opened');
 * 
 * @example
 * // Format status for display
 * const statusInfo = StatusFormatter.formatStatus('success', null, '✅');
 * 
 * @example
 * // Format commit list
 * const formattedCommits = DataFormatter.formatCommits(commits, 5);
 */

import { STATUS_MAPPINGS, EVENT_EMOJIS } from '../constants/eventConfig.js';
import { AppConfig } from '../config/appConfig.js';
import { Logger } from './logger.js';

/**
 * @class NotificationValidator
 * @description Utility class for notification validation logic.
 * Determines whether events should be processed based on configuration rules.
 */
export class NotificationValidator {
  /**
   * Check if notification should be sent (always true now - no priority filtering)
   */
  static shouldNotify(eventType, action) {
    // Always return true - no priority filtering anymore
    return true;
  }

  /**
   * Check if notification should be sent based on NOTIFY_* environment variables
   * This is separate from event processing - events are always processed for analysis,
   * but notifications are only sent if explicitly enabled
   */
  static shouldSendNotification(eventType, action) {
    return AppConfig.isNotificationEnabled(eventType, action);
  }
}

/**
 * Utility class for formatting status and creating display information
 */
export class StatusFormatter {
  /**
   * Format status for display in emails and notifications
   */
  static formatStatus(status, conclusion, emojiOverride = null) {
    const key = conclusion || status;
    const result = STATUS_MAPPINGS[key] || { 
      status: (key || 'UNKNOWN').toUpperCase(), 
      emoji: '❓', 
      color: '#6c757d' 
    };
    
    if (emojiOverride) {
      result.emoji = emojiOverride;
    }
    
    return result;
  }

  /**
   * Get emoji for a specific event type
   */
  static getEventEmoji(eventType, action = null) {
    const eventKey = action ? `${eventType}.${action}` : eventType;
    return EVENT_EMOJIS[eventKey] || '📢';
  }

  /**
   * Format status for pull request events with appropriate emojis
   */
  static formatPRStatus(action, isMerged = false) {
    if (action === 'closed' && isMerged) {
      return this.formatStatus('merged', null, '🎉');
    }
    
    const emoji = this.getEventEmoji('pull_request', action);
    return this.formatStatus(action, null, emoji);
  }
}

/**
 * Utility class for string and data formatting
 */
export class DataFormatter {
  /**
   * Truncate text to a maximum length
   */
  static truncate(text, maxLength = 100) {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
  }

  /**
   * Format commit messages for display
   */
  static formatCommits(commits, maxCommits = 5) {
    if (!commits || commits.length === 0) return '';
    
    const displayCommits = commits.slice(0, maxCommits);
    const formatted = displayCommits.map(commit => 
      `• ${this.truncate(commit.message, 80)}`
    ).join('\n');
    
    if (commits.length > maxCommits) {
      const remaining = commits.length - maxCommits;
      return formatted + `\n• ... and ${remaining} more commit${remaining > 1 ? 's' : ''}`;
    }
    
    return formatted;
  }

  /**
   * Format user list for display
   */
  static formatUserList(users, maxUsers = 3) {
    if (!users || users.length === 0) return '';
    
    if (users.length <= maxUsers) {
      return users.join(', ');
    }
    
    const displayed = users.slice(0, maxUsers);
    const remaining = users.length - maxUsers;
    return `${displayed.join(', ')} and ${remaining} more`;
  }

  /**
   * Format repository name for display
   */
  static formatRepository(repo) {
    return repo.full_name || `${repo.owner.login}/${repo.name}`;
  }
}