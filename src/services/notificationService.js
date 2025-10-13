/**
 * @fileoverview Core Notification Service
 * @description Main orchestration service that coordinates the entire notification process.
 * Handles event processing, recipient determination, email generation, and workflow tracking.
 * Acts as the central coordinator between GitHub events and email notifications.
 * 
 * @author Jürgen Efeish
 * 
 * @module NotificationService
 * 
 * @requires Logger - Logging utility
 * @requires WorkflowTracker - Workflow tracking and debugging
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
 * @example
 * // Send commit-related notification
 * const result = await notificationService.sendCommitNotification(
 *   context,
 *   'check_run',
 *   'completed',
 *   commitSha,
 *   notificationData
 * );
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
      
      // Validate event should be processed
      if (!NotificationValidator.shouldProcessEvent(eventType, action)) {
        Logger.debug(`Event ${eventType}.${action} not enabled or below priority threshold`);
        return { success: false, reason: 'Event not enabled or below priority threshold' };
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
   * Send notifications for commit-related events (check runs, etc.)
   */
  async sendCommitNotification(context, eventType, action, commitSha, data) {
    try {
      Logger.info(`Processing ${eventType}.${action} for commit ${commitSha}`);
      
      // Find associated pull requests
      const prResult = await this.githubService.getPullRequestsForCommit(context, commitSha);
      
      if (!prResult.success || prResult.pullRequests.length === 0) {
        Logger.debug(`No pull requests found for commit ${commitSha}`);
        return { success: false, reason: 'No associated pull requests found' };
      }

      Logger.debug(`Found ${prResult.pullRequests.length} associated PR(s) for commit ${commitSha}`);
      
      const results = [];
      
      // Process each pull request
      for (const pr of prResult.pullRequests) {
        const prResult = await this.sendPRNotification(context, eventType, action, {
          ...data,
          pullRequest: pr
        });
        
        results.push({ pr: pr.number, ...prResult });
      }
      
      const successCount = results.filter(r => r.success).length;
      Logger.info(`Commit ${commitSha} notifications: ${successCount}/${results.length} successful`);
      
      return {
        success: results.some(r => r.success),
        results
      };
      
    } catch (error) {
      Logger.error(`Failed to send commit notification for ${eventType}.${action}`, error);
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
    
    // Add additional recipients
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
   * Get service health status
   */
  getHealthStatus() {
    const emailConfig = this.emailService.getConfigurationSummary();
    const appConfig = AppConfig.getEnabledEvents();
    
    return {
      email: emailConfig,
      enabledEvents: appConfig,
      configuration: {
        debugWorkflow: AppConfig.notifications.debugWorkflow
      }
    };
  }
}