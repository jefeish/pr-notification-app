/**
 * @fileoverview Pull Request Event Handler
 * @description Specialized handler for GitHub pull request webhook events including
 * opened, closed, edited, synchronized, and review-related actions. Processes
 * PR events and generates appropriate notifications with contextual information.
 * 
 * @author Jürgen Efeish
 * 
 * @module PullRequestHandler
 * 
 * @requires BaseHandler - Base handler class
 * @requires StatusFormatter - Status formatting utilities
 * @requires Logger - Logging utility
 * 
 * @example
 * // Handler usage (typically done by factory)
 * const handler = new PullRequestHandler(notificationService);
 * const result = await handler.handle(context, 'opened');
 * 
 * @supports
 * - pull_request.opened
 * - pull_request.closed
 * - pull_request.edited
 * - pull_request.reopened
 * - pull_request.synchronize
 * - pull_request.ready_for_review
 * - pull_request.review_requested
 */

import { BaseHandler } from './baseHandler.js';
import { StatusFormatter } from '../utils/validators.js';
import { Logger } from '../utils/logger.js';

/**
 * @class PullRequestHandler
 * @extends BaseHandler
 * @description Handler for GitHub pull request webhook events.
 * Processes various PR actions and generates contextual notifications.
 */
export class PullRequestHandler extends BaseHandler {
  async handle(context, action) {
    const repo = context.payload.repository?.full_name || 'unknown';
    const eventType = context.payload.review ? 'pull_request_review' : 'pull_request';
    Logger.info(`WEBHOOK RECEIVED: ${eventType}.${action} in ${repo}`);
    
    const { pull_request: pr } = context.payload;
    
    let result;
    
    switch (action) {
      case 'opened':
        result = await this.handleOpened(context, pr);
        break;
      case 'closed':
        result = await this.handleClosed(context, pr);
        break;
      case 'edited':
        result = await this.handleEdited(context, pr);
        break;
      case 'reopened':
        result = await this.handleReopened(context, pr);
        break;
      case 'synchronize':
        result = await this.handleSynchronize(context, pr);
        break;
      case 'ready_for_review':
        result = await this.handleReadyForReview(context, pr);
        break;
      case 'review_requested':
        result = await this.handleReviewRequested(context, pr);
        break;
      case 'submitted':
        result = await this.handleReviewSubmitted(context, pr);
        break;
      default:
        Logger.warn(`Unknown pull request action: ${action}`);
        result = { success: false, reason: `Unknown action: ${action}` };
    }
    
    const status = result.success ? 'SUCCESS' : 'FAILED';
    Logger.info(`NOTIFICATION PROCESSING: ${eventType}.${action} - ${status}`);
    return result;
  }

  async handleOpened(context, pr) {
    Logger.info(`New pull request opened - #${pr.number} "${pr.title}" by PR owner: ${pr.user.login}`);
    
    const statusInfo = StatusFormatter.formatPRStatus('opened');
    
    const data = this.createNotificationData(
      `🎉 New Pull Request #${pr.number}: ${pr.title}`,
      `PR owner ${pr.user.login} opened a new pull request`,
      pr.html_url,
      statusInfo,
      pr.body || 'No description provided'
    );
    
    return await this.notificationService.sendPRNotification(context, 'pull_request', 'opened', data);
  }

  async handleClosed(context, pr) {
    const wasMerged = pr.merged;
    Logger.info(`Pull request ${wasMerged ? 'merged' : 'closed'} - #${pr.number} "${pr.title}"`);
    
    if (wasMerged && pr.merged_by) {
      Logger.debug(`Merged by ${pr.merged_by.login}`);
    }
    
    const statusInfo = StatusFormatter.formatPRStatus('closed', wasMerged);
    
    const data = this.createNotificationData(
      `${wasMerged ? '🎉 Pull Request Merged' : '❌ Pull Request Closed'} #${pr.number}: ${pr.title}`,
      wasMerged 
        ? `Pull request was merged by ${pr.merged_by?.login || 'unknown'}` 
        : `Pull request was closed by ${pr.user.login}`,
      pr.html_url,
      statusInfo
    );
    
    return await this.notificationService.sendPRNotification(context, 'pull_request', 'closed', data);
  }

  async handleEdited(context, pr) {
    Logger.info(`Pull request edited - #${pr.number} "${pr.title}" by PR owner: ${pr.user.login}`);
    
    const statusInfo = StatusFormatter.formatPRStatus('edited');
    
    const data = this.createNotificationData(
      `✏️ Pull Request #${pr.number} Updated: ${pr.title}`,
      `PR owner ${pr.user.login} updated the pull request`,
      pr.html_url,
      statusInfo
    );
    
    return await this.notificationService.sendPRNotification(context, 'pull_request', 'edited', data);
  }

  async handleReopened(context, pr) {
    Logger.info(`Pull request reopened - #${pr.number} "${pr.title}" by PR owner: ${pr.user.login}`);
    
    const statusInfo = StatusFormatter.formatPRStatus('reopened');
    
    const data = this.createNotificationData(
      `🔄 Pull Request Reopened #${pr.number}: ${pr.title}`,
      `PR owner ${pr.user.login} reopened the pull request`,
      pr.html_url,
      statusInfo
    );
    
    return await this.notificationService.sendPRNotification(context, 'pull_request', 'reopened', data);
  }

  async handleSynchronize(context, pr) {
    Logger.info(`Pull request synchronized - #${pr.number} "${pr.title}"`);
    
    const statusInfo = StatusFormatter.formatPRStatus('synchronize');
    
    const data = this.createNotificationData(
      `🔄 New commits pushed to PR #${pr.number}: ${pr.title}`,
      `New commits were pushed to the pull request`,
      pr.html_url,
      statusInfo
    );
    
    return await this.notificationService.sendPRNotification(context, 'pull_request', 'synchronize', data);
  }

  async handleReadyForReview(context, pr) {
    Logger.info(`Pull request ready for review - #${pr.number} "${pr.title}"`);
    
    const statusInfo = StatusFormatter.formatPRStatus('ready_for_review');
    
    const data = this.createNotificationData(
      `👀 Pull Request Ready for Review #${pr.number}: ${pr.title}`,
      `Pull request is now ready for review`,
      pr.html_url,
      statusInfo
    );
    
    return await this.notificationService.sendPRNotification(context, 'pull_request', 'ready_for_review', data);
  }

  async handleReviewRequested(context, pr) {
    const { requested_reviewer } = context.payload;
    
    if (!requested_reviewer) {
      Logger.warn('Review requested event without requested_reviewer');
      return { success: false, reason: 'No requested reviewer found' };
    }
    
    Logger.info(`Review requested from ${requested_reviewer.login} for PR #${pr.number}`);
    
    const statusInfo = StatusFormatter.formatPRStatus('review_requested');
    
    // Get reviewer email for targeted notification
    const githubService = this.notificationService.githubService;
    const reviewerResult = await githubService.getUserEmail(context, requested_reviewer.login);
    const recipients = reviewerResult.success ? [reviewerResult.email] : [];
    
    const data = this.createNotificationData(
      `👥 Review Requested for PR #${pr.number}: ${pr.title}`,
      `Review requested from ${requested_reviewer.login}`,
      pr.html_url,
      statusInfo
    );
    
    return await this.notificationService.sendPRNotification(context, 'pull_request', 'review_requested', data, recipients);
  }

  async handleReviewSubmitted(context, pr) {
    const { review } = context.payload;
    const statusInfo = StatusFormatter.formatStatus('submitted', review.state, '📝');
    
    const data = this.createNotificationData(
      `📝 Review ${review.state} for PR #${pr.number}: ${pr.title}`,
      `${review.user.login} submitted a ${review.state} review`,
      review.html_url,
      statusInfo,
      review.body || 'No review comments'
    );
    
    const result = await this.notificationService.sendPRNotification(context, 'pull_request_review', 'submitted', data);

    // Check if this review made the PR ready to merge (especially for approvals)
    if (review.state === 'APPROVED') {
      try {
        await this.checkAndNotifyReadyToMerge(context, pr, 'review_approved');
      } catch (error) {
        Logger.warn(`Failed to check ready-to-merge status after approval: ${error.message}`);
      }
    }

    return result;
  }

  /**
   * Check if PR became ready to merge after a review or check completion
   * @param {Object} context - GitHub context
   * @param {Object} pr - Pull request object
   * @param {string} triggerEvent - What triggered this check (review, check_run, etc.)
   * @returns {Promise<Object>} Result object
   */
  async checkAndNotifyReadyToMerge(context, pr, triggerEvent) {
    Logger.debug(`Checking if PR #${pr.number} is ready to merge after ${triggerEvent}`);
    
    try {
      const githubService = this.notificationService.githubService;
      const readinessResult = await githubService.checkPRReadyToMerge(context, pr.number);
      
      if (!readinessResult.success) {
        Logger.warn(`Failed to check PR #${pr.number} readiness: ${readinessResult.error}`);
        return { success: false, reason: 'readiness_check_failed' };
      }

      if (!readinessResult.ready) {
        Logger.debug(`PR #${pr.number} not ready to merge: ${readinessResult.details.summary}`);
        return { success: true, reason: 'not_ready_to_merge' };
      }

      // Check if we already notified about readiness recently (avoid spam)
      const eventKey = `ready_to_merge_${pr.number}`;
      if (this.isRecentEvent(eventKey)) {
        Logger.debug(`Already notified about PR #${pr.number} readiness recently`);
        return { success: true, reason: 'already_notified_recently' };
      }

      // PR is ready to merge - send notification!
      Logger.info(`🎉 PR #${pr.number} is now ready to merge!`);
      
      const details = readinessResult.details;
      const statusInfo = {
        status: 'READY TO MERGE',
        emoji: '🚀',
        color: '#28a745'
      };

      const data = this.createNotificationData(
        `🚀 PR #${pr.number} Ready to Merge: ${pr.title}`,
        `Your pull request has all approvals and checks are passing!`,
        pr.html_url,
        statusInfo,
        `✅ ${details.details.approvalCount} approval(s)\n✅ ${details.details.passedCheckRuns} checks passed\n🎯 Status: ${details.summary}`
      );

      // Track this notification to avoid duplicates
      this.trackRecentEvent(eventKey);

      return await this.notificationService.sendPRNotification(context, 'pull_request', 'ready_to_merge', data);

    } catch (error) {
      Logger.error(`Error checking PR #${pr.number} ready to merge status`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Check if we've recently sent a notification for this event
   * @param {string} eventKey - Unique event identifier
   * @returns {boolean} True if recent
   */
  isRecentEvent(eventKey) {
    if (!this.constructor.recentReadyToMergeEvents) {
      this.constructor.recentReadyToMergeEvents = new Map();
    }

    const now = Date.now();
    const recentTime = 30 * 60 * 1000; // 30 minutes

    // Clean old events
    for (const [key, timestamp] of this.constructor.recentReadyToMergeEvents.entries()) {
      if (now - timestamp > recentTime) {
        this.constructor.recentReadyToMergeEvents.delete(key);
      }
    }

    return this.constructor.recentReadyToMergeEvents.has(eventKey);
  }

  /**
   * Track that we sent a ready-to-merge notification
   * @param {string} eventKey - Unique event identifier
   */
  trackRecentEvent(eventKey) {
    if (!this.constructor.recentReadyToMergeEvents) {
      this.constructor.recentReadyToMergeEvents = new Map();
    }
    this.constructor.recentReadyToMergeEvents.set(eventKey, Date.now());
  }
}