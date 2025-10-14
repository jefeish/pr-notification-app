/**
 * @fileoverview Core Notification Service
 * @description Main orchestration service that coordinates the entire notification process.
 * Handles event processing, recipient determination, and email generation.
 * Acts as the central coordinator between GitHub events and email notifications.
 * 
 * @author Jürgen Efeish
 * 
 * @module NotificationService
 * 
 * @requires Logger - Logging utility
 * @requires NotificationValidator - Event validation logic
 * @requires StatusFormatter - Status formatting utilities
 * @requires EmailTemplate - Email template generation
 * @requires AppConfig - Application configuration
 * 
 * @example
 * // Initialize service with dependencies
 * const notificationService = new NotificationService(emailService, githubService, app);
 * 
 * @example
 * // Send PR notification
 * const result = await notificationService.sendPRNotification(
 *   context,
 *   'pull_request',
 *   'opened',
 *   {
 *     subject: 'New PR Opened',
 *     description: 'A new pull request was created',
 *     detailsUrl: pr.html_url
 *   }
 * );
 * 
 */

import { Logger } from '../utils/logger.js';
import { NotificationValidator, StatusFormatter } from '../utils/validators.js';
import { EmailTemplate } from '../templates/emailTemplate.js';
import { AppConfig } from '../config/appConfig.js';

/**
 * @class NotificationService
 * @description Core notification service that orchestrates the notification process.
 * Coordinates between GitHub events, email generation, and notification delivery.
 */
export class NotificationService {
  constructor(emailService, githubService, app) {
    this.emailService = emailService;
    this.githubService = githubService;
    this.app = app;
  }

  /**
   * Send PR-related notification
   */
  async sendPRNotification(context, eventType, action, data, customRecipients = null) {
    try {
      Logger.info(`Processing ${eventType}.${action} for PR notification`);
      
      // Check if notification should be sent (separate from event processing)
      if (!NotificationValidator.shouldSendNotification(eventType, action)) {
        Logger.debug(`Notification for ${eventType}.${action} is disabled`);
        return { success: false, reason: 'Notification disabled' };
      }

      // Validate context
      const contextValidation = this.githubService.validateContext(context);
      if (!contextValidation.valid) {
        throw new Error(`Invalid context: ${contextValidation.errors.join(', ')}`);
      }

      // Extract PR and repository information
      const pr = context.payload.pull_request;
      const repository = this.githubService.getRepositoryInfo(context);
      
      if (!pr) {
        throw new Error('No pull request found in payload');
      }

      // Determine recipients (PR owner + additional)
      const recipients = await this.determineRecipients(context, pr, customRecipients);
      
      if (recipients.emails.length === 0) {
        Logger.warn(`No email recipients found for PR #${pr.number}`);
        return { success: false, reason: 'No email recipients found' };
      }

      // Generate and send email
      const emailData = this.generateEmailContent(data, repository, pr, eventType, action);
      const sendResult = await this.sendNotifications(recipients.emails, emailData, eventType, action);
      
      Logger.info(`PR #${pr.number} notification sent to ${recipients.emails.length} recipient(s): ${sendResult.success ? 'SUCCESS' : 'FAILED'}`);
      
      return {
        success: sendResult.success,
        summary: sendResult.summary,
        recipients: recipients.emails
      };
      
    } catch (error) {
      Logger.error(`Failed to send PR notification for ${eventType}.${action}`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Determine email recipients for the notification
   * Always prioritizes PR owner/creator first, then adds additional recipients
   */
  async determineRecipients(context, pr, customRecipients) {
    const prCreator = pr.user.login;
    const recipients = [];
    let prCreatorNotified = false;
    
    // PR Creator/Owner is ALWAYS the primary recipient
    const creatorEmailResult = await this.githubService.getUserEmail(context, prCreator);
    if (creatorEmailResult.success) {
      recipients.push(creatorEmailResult.email);
      prCreatorNotified = true;
      Logger.debug(`PR owner ${prCreator} will be notified at ${creatorEmailResult.email}`);
    } else {
      Logger.error(`CRITICAL: PR owner ${prCreator} has no accessible email! Reason: ${creatorEmailResult.reason}`, null, {
        prNumber: pr.number,
        prCreator: prCreator
      });
    }
    
    // Add additional recipients (only if enabled via environment flag)
    const includeAdditionalRecipients = AppConfig.includeAdditionalRecipients();
    
    if (includeAdditionalRecipients) {
      if (customRecipients && customRecipients.length > 0) {
        // Add custom recipients, avoiding duplicates
        const uniqueCustom = customRecipients.filter(email => !recipients.includes(email));
        recipients.push(...uniqueCustom);
        Logger.debug(`Added ${uniqueCustom.length} custom recipients`);
      } else {
        // Add default additional recipients (assignees, reviewers, configured)
        const prRecipients = await this.githubService.getAdditionalPRRecipients(context, pr, prCreator);
        const configuredRecipients = await this.getConfiguredAdditionalRecipients(context);
        
        const allAdditional = [...prRecipients.emails, ...configuredRecipients.emails];
        const uniqueAdditional = allAdditional.filter(email => !recipients.includes(email));
        
        recipients.push(...uniqueAdditional);
        Logger.debug(`Added ${uniqueAdditional.length} additional recipients (${prRecipients.emails.length} from PR, ${configuredRecipients.emails.length} from config)`);
      }
    } else {
      Logger.debug('Additional recipients disabled via NOTIFY_ADDITIONAL_RECIPIENTS flag - only notifying PR owner');
    }
    
    return { 
      emails: recipients, 
      summary: { 
        total: recipients.length, 
        prCreatorNotified: prCreatorNotified
      } 
    };
  }

  /**
   * Get additional recipients from configuration
   */
  async getConfiguredAdditionalRecipients(context) {
    const config = AppConfig.notifications.additionalRecipients;
    const recipients = [];
    
    // Add direct email addresses from config
    if (config.emails.length > 0) {
      recipients.push(...config.emails);
      Logger.debug(`Added ${config.emails.length} configured email recipients`);
    }
    
    // Resolve GitHub usernames to emails
    if (config.usernames.length > 0) {
      Logger.debug(`Resolving ${config.usernames.length} configured GitHub usernames`);
      const usernameEmails = await this.githubService.getBulkUserEmails(context, config.usernames);
      recipients.push(...usernameEmails.emails);
      
      if (usernameEmails.summary.missing > 0) {
        Logger.warn(`Could not resolve ${usernameEmails.summary.missing} configured GitHub usernames to emails`);
      }
    }
    
    return {
      emails: recipients,
      summary: {
        totalConfigured: config.emails.length + config.usernames.length,
        emailsResolved: recipients.length
      }
    };
  }

  /**
   * Generate email content
   */
  generateEmailContent(data, repository, pr, eventType, action) {
    const subject = data.subject || EmailTemplate.generateSubject(eventType, action, {
      pullRequest: pr,
      statusInfo: data.statusInfo,
      ...data
    });
    
    const emailData = EmailTemplate.createEmailContent({
      subject,
      repository: repository.fullName,
      pullRequest: pr,
      event: `${eventType}.${action}`,
      description: data.description,
      detailsUrl: data.detailsUrl,
      statusInfo: data.statusInfo,
      summary: data.summary
    });
    
    return {
      subject,
      ...emailData
    };
  }

  /**
   * Send notifications to recipients
   */
  async sendNotifications(recipients, emailData, eventType, action) {
    return await this.emailService.sendBulkNotifications(
      recipients,
      emailData.subject,
      emailData.htmlContent,
      emailData.textContent,
      eventType,
      action
    );
  }

  /**
   * Send ready-to-merge notification - bypasses regular event processing checks
   * This is for cross-event analysis notifications that should be controlled independently
   * @param {Object} context - GitHub context
   * @param {Object} data - Notification data
   * @returns {Promise<Object>} Result object
   */
  async sendReadyToMergeNotification(context, data) {
    try {
      Logger.info(`Processing ready-to-merge notification`);
      
      // Check if ready-to-merge notifications are enabled
      if (!NotificationValidator.shouldSendNotification('pull_request', 'ready_to_merge')) {
        Logger.debug(`Ready-to-merge notifications are disabled`);
        return { success: false, reason: 'Ready-to-merge notifications disabled' };
      }

      // Validate context
      const contextValidation = this.githubService.validateContext(context);
      if (!contextValidation.valid) {
        throw new Error(`Invalid context: ${contextValidation.errors.join(', ')}`);
      }

      // Extract PR and repository information
      const pr = context.payload.pull_request;
      const repository = this.githubService.getRepositoryInfo(context);
      
      if (!pr) {
        throw new Error('No pull request found in payload');
      }

      // Determine recipients (PR owner + additional)
      const recipients = await this.determineRecipients(context, pr, null);
      
      if (recipients.emails.length === 0) {
        Logger.warn(`No email recipients found for ready-to-merge PR #${pr.number}`);
        return { success: false, reason: 'No email recipients found' };
      }

      // Generate and send email
      const emailData = this.generateEmailContent(data, repository, pr, 'pull_request', 'ready_to_merge');
      const sendResult = await this.sendNotifications(recipients.emails, emailData, 'pull_request', 'ready_to_merge');
      
      Logger.info(`Ready-to-merge notification for PR #${pr.number} sent to ${recipients.emails.length} recipient(s): ${sendResult.success ? 'SUCCESS' : 'FAILED'}`);
      
      return {
        success: sendResult.success,
        summary: sendResult.summary,
        recipients: recipients.emails
      };
      
    } catch (error) {
      Logger.error(`Failed to send ready-to-merge notification`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get service health status
   */
  getHealthStatus() {
    const emailConfig = this.emailService.getConfigurationSummary();
    const appConfig = AppConfig.getEnabledEvents();
    
    return {
      email: emailConfig,
      enabledEvents: appConfig
    };
  }
}