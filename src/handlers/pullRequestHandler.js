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
    
    return await this.notificationService.sendPRNotification(context, 'pull_request_review', 'submitted', data);
  }
}