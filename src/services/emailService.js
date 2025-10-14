/**
 * @fileoverview Email Service
 * @description Robust email service for sending notifications using SMTP with comprehensive
 * error handling, bulk sending capabilities, and configuration validation.
 * Integrates with nodemailer for reliable email delivery.
 * 
 * @author Jürgen Efeish
 * 
 * @module EmailService
 * 
 * @requires nodemailer - Email sending library
 * @requires Logger - Logging utility
 * @requires NotificationValidator - Notification validation logic
 * @requires AppConfig - Application configuration
 * 
 * @example
 * // Initialize and send email
 * const emailService = new EmailService();
 * const result = await emailService.sendNotification(
 *   'user@example.com',
 *   'PR Notification',
 *   htmlContent,
 *   textContent,
 *   'pull_request',
 *   'opened'
 * );
 * 
 * @example
 * // Bulk email sending
 * const results = await emailService.sendBulkNotifications(
 *   ['user1@example.com', 'user2@example.com'],
 *   subject,
 *   htmlContent,
 *   textContent,
 *   'pull_request',
 *   'closed'
 * );
 * 
 * @example
 * // Test configuration
 * const testResult = await emailService.testConfiguration();
 * if (!testResult.success) {
 *   console.error('Email config invalid:', testResult.error);
 * }
 */

import nodemailer from 'nodemailer';
import { Logger } from '../utils/logger.js';
import { NotificationValidator } from '../utils/validators.js';
import { AppConfig } from '../config/appConfig.js';

/**
 * @class EmailService
 * @description Email service for sending notifications with SMTP integration.
 * Provides reliable email delivery with error handling and configuration validation.
 */
export class EmailService {
  constructor() {
    this.transporter = null;
  }

  /**
   * Create email transport
   */
  createTransport() {
    const config = AppConfig.email;
    
    if (!config.user || !config.pass) {
      Logger.warn('SMTP credentials not configured. Email notifications will be skipped.');
      return null;
    }

    try {
      this.transporter = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: {
          user: config.user,
          pass: config.pass
        }
      });

      Logger.debug(`Email transporter created for ${config.host}:${config.port}`);
      return this.transporter;
    } catch (error) {
      Logger.error('Failed to create email transporter', error);
      return null;
    }
  }

  /**
   * Get or create transporter
   */
  getTransporter() {
    if (!this.transporter) {
      this.transporter = this.createTransport();
    }
    return this.transporter;
  }

  /**
   * Validate email configuration
   */
  isConfigured() {
    const config = AppConfig.email;
    return !!(config.user && config.pass && config.host);
  }

  /**
   * @async
   * @memberof EmailService
   * @description Send an email notification with validation
   * 
   * @param {string} to - Recipient email address
   * @param {string} subject - Email subject line
   * @param {string} htmlContent - HTML email content
   * @param {string} textContent - Plain text email content
   * @param {string} eventType - GitHub event type for logging
   * @param {string} action - GitHub event action for logging
   * 
   * @returns {Promise<Object>} Result object with success status and details
   * @property {boolean} success - Whether the email was sent successfully
   * @property {string} [messageId] - Email message ID if successful
   * @property {string} [reason] - Failure reason if unsuccessful
   * @property {string} recipient - Recipient email address
   * @property {string} subject - Email subject
   * 
   * @throws {Error} When email transporter creation fails
   * 
   * @example
   * const result = await emailService.sendNotification(
   *   'user@example.com',
   *   'PR Opened',
   *   htmlContent,
   *   textContent,
   *   'pull_request',
   *   'opened'
   * );
   * if (result.success) {
   *   console.log('Email sent:', result.messageId);
   * }
   */
  async sendNotification(to, subject, htmlContent, textContent, eventType, action) {
    Logger.info(`Attempting to send email notification for ${eventType}.${action} to ${to}`);
    
    // Check if email is configured
    if (!this.isConfigured()) {
      Logger.warn('SMTP credentials not configured. Email notification skipped.');
      // In debug mode, log what would have been sent
      Logger.info('📧 [MOCK EMAIL] Would send to:', to);
      Logger.info('📧 [MOCK EMAIL] Subject:', subject);
      Logger.debug('📧 [MOCK EMAIL] HTML Content:', htmlContent.substring(0, 200) + '...');
      return { success: true, reason: 'SMTP not configured - mock email logged' };
    }

    // All events are processed - no priority filtering

    // Validate email address
    if (!this.isValidEmail(to)) {
      Logger.error(`Invalid email address: ${to}`);
      return { success: false, reason: 'Invalid email address' };
    }

    try {
      const transporter = this.getTransporter();
      if (!transporter) {
        throw new Error('Failed to create email transporter');
      }

      const config = AppConfig.email;
      const mailOptions = {
        from: config.from || config.user,
        to: to,
        subject: subject,
        text: textContent,
        html: htmlContent,
        headers: {
          'X-Notification-Type': `${eventType}.${action}`,
          'X-Generated-By': 'PR-Notification-App'
        }
      };

      Logger.debug(`Sending email with subject: "${subject}"`);
      const info = await transporter.sendMail(mailOptions);
      
      Logger.info(`✅ Email sent successfully: ${info.messageId} for ${eventType}.${action} to ${to}`);
      Logger.audit('EMAIL_SENT', { 
        eventType, 
        action, 
        recipient: to, 
        subject, 
        messageId: info.messageId 
      });
      return { 
        success: true, 
        messageId: info.messageId,
        recipient: to,
        subject: subject
      };
    } catch (error) {
      Logger.error(`❌ Failed to send email to ${to}`, error);
      return { 
        success: false, 
        reason: error.message,
        recipient: to,
        subject: subject
      };
    }
  }

  /**
   * Send notifications to multiple recipients
   */
  async sendBulkNotifications(recipients, subject, htmlContent, textContent, eventType, action) {
    Logger.info(`Sending bulk notifications to ${recipients.length} recipient(s) for ${eventType}.${action}`);
    
    const results = [];
    let successCount = 0;
    let failureCount = 0;

    for (const email of recipients) {
      try {
        const result = await this.sendNotification(
          email, 
          subject, 
          htmlContent, 
          textContent,
          eventType,
          action
        );
        
        results.push({ email, ...result });
        
        if (result.success) {
          successCount++;
          Logger.info(`Notification sent to ${email} for ${eventType}.${action}`);
        } else {
          failureCount++;
          Logger.error(`Failed to send notification to ${email}: ${result.reason}`);
        }
      } catch (error) {
        failureCount++;
        const errorResult = { 
          email, 
          success: false, 
          reason: error.message 
        };
        results.push(errorResult);
        Logger.error(`Failed to send notification to ${email}`, error);
      }
    }

    Logger.info(`Bulk notification complete: ${successCount} sent, ${failureCount} failed`);
    
    return {
      success: successCount > 0,
      results,
      summary: {
        total: recipients.length,
        success: successCount,
        failed: failureCount
      }
    };
  }

  /**
   * Validate email address format
   */
  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Test email configuration
   */
  async testConfiguration() {
    try {
      const transporter = this.getTransporter();
      if (!transporter) {
        return { success: false, error: 'No transporter available' };
      }

      await transporter.verify();
      Logger.info('Email configuration test successful');
      return { success: true };
    } catch (error) {
      Logger.error('Email configuration test failed', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get configuration summary
   */
  getConfigurationSummary() {
    const config = AppConfig.email;
    return {
      configured: this.isConfigured(),
      host: config.host,
      port: config.port,
      secure: config.secure,
      from: config.from || config.user,
      hasCredentials: !!(config.user && config.pass)
    };
  }
}