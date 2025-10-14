/**
 * @fileoverview Deployment Event Handler
 * @description Handler for GitHub deployment and deployment_status events.
 * Processes deployment events and sends appropriate notifications to PR creators
 * and reviewers about deployment status, environments, and results.
 * 
 * @author Jürgen Efeish
 * 
 * @module DeploymentHandler
 * @extends BaseHandler
 * 
 * @requires BaseHandler - Base event handler class
 * @requires Logger - Logging utility
 * 
 * @example
 * // Usage via EventHandlerFactory
 * const handler = EventHandlerFactory.createHandler('deployment', notificationService);
 * const result = await handler.handle(context, 'created');
 * 
 * @example
 * // Register with factory
 * EventHandlerFactory.register('deployment', DeploymentHandler);
 * EventHandlerFactory.register('deployment_status', DeploymentHandler);
 */

import { BaseHandler } from './baseHandler.js';
import { Logger } from '../utils/logger.js';

/**
 * @class DeploymentHandler
 * @extends BaseHandler
 * @description Handler for GitHub deployment events.
 * Processes deployment and deployment_status events and sends notifications.
 */
export class DeploymentHandler extends BaseHandler {
  constructor(notificationService) {
    super(notificationService);
    // Static tracking for event deduplication
    if (!DeploymentHandler.recentEvents) {
      DeploymentHandler.recentEvents = new Map();
    }
  }

  /**
   * Handle deployment events
   * @param {Object} context - GitHub webhook context
   * @param {string} action - Event action (created, updated, etc.) or status state
   * @returns {Promise<Object>} Result object with success status
   */
  async handle(context, action) {
    const repo = context.payload.repository?.full_name || 'unknown';
    const eventType = context.name; // 'deployment' or 'deployment_status'
    
    Logger.info(`🚀 Processing ${eventType}.${action} for ${repo}`);

    try {
      // Handle different event types
      if (eventType === 'deployment') {
        return await this.handleDeployment(context, action);
      } else if (eventType === 'deployment_status') {
        return await this.handleDeploymentStatus(context, action);
      }

      return { 
        success: false, 
        reason: `Unsupported deployment event type: ${eventType}` 
      };

    } catch (error) {
      Logger.error(`Error handling ${eventType}.${action}`, error);
      return { 
        success: false, 
        error: error.message 
      };
    }
  }

  /**
   * Handle deployment creation events
   * @param {Object} context - GitHub webhook context
   * @param {string} action - Event action
   * @returns {Promise<Object>} Result object
   */
  async handleDeployment(context, action) {
    const deployment = context.payload.deployment;
    
    if (!deployment) {
      return { success: false, reason: 'No deployment data in payload' };
    }

    // Only notify on deployment creation
    if (action !== 'created') {
      Logger.debug(`Skipping deployment.${action} - only handling 'created'`);
      return { success: true, reason: 'Event ignored - not deployment created' };
    }

    // Get basic deployment info
    const deploymentInfo = {
      id: deployment.id,
      sha: deployment.sha,
      ref: deployment.ref,
      environment: deployment.environment,
      description: deployment.description,
      creator: deployment.creator?.login || 'unknown'
    };

    Logger.info(`📡 Deployment created: ${deploymentInfo.environment} (${deploymentInfo.sha?.substring(0, 7)})`);

    // Find associated pull requests
    const pullRequests = await this.findPullRequestsForCommit(context, deployment.sha);
    
    if (pullRequests.length === 0) {
      Logger.info('No pull requests found for deployment commit');
      return { success: true, reason: 'No associated pull requests' };
    }

    // Send notifications for each PR
    const results = [];
    for (const pr of pullRequests) {
      const result = await this.sendDeploymentNotification(context, deploymentInfo, pr);
      results.push(result);
    }

    const successCount = results.filter(r => r.success).length;
    Logger.info(`✅ Sent ${successCount}/${results.length} deployment notifications`);

    return { 
      success: successCount > 0,
      results: results
    };
  }

  /**
   * Handle deployment status events (success, failure, etc.)
   * @param {Object} context - GitHub webhook context
   * @param {string} action - Event action (actually the status state)
   * @returns {Promise<Object>} Result object
   */
  async handleDeploymentStatus(context, action) {
    const deploymentStatus = context.payload.deployment_status;
    const deployment = context.payload.deployment;
    
    if (!deploymentStatus || !deployment) {
      return { success: false, reason: 'Missing deployment status or deployment data' };
    }

    const status = deploymentStatus.state; // success, failure, error, pending, etc.
    
    // Only notify on final states
    if (!['success', 'failure', 'error'].includes(status)) {
      Logger.debug(`Skipping deployment_status.${status} - only handling final states`);
      return { success: true, reason: `Event ignored - status '${status}' not final` };
    }

    const deploymentInfo = {
      id: deployment.id,
      sha: deployment.sha,
      ref: deployment.ref,
      environment: deployment.environment,
      description: deployment.description,
      status: status,
      targetUrl: deploymentStatus.target_url,
      logUrl: deploymentStatus.log_url,
      updatedAt: deploymentStatus.updated_at
    };

    Logger.info(`🎯 Deployment ${status}: ${deploymentInfo.environment} (${deploymentInfo.sha?.substring(0, 7)})`);

    // Check for duplicate events
    const eventKey = `${deployment.id}-${status}`;
    if (this.isDuplicateEvent(eventKey)) {
      Logger.debug(`Duplicate deployment status event detected: ${eventKey}`);
      return { success: true, reason: 'Duplicate event ignored' };
    }

    // Find associated pull requests
    const pullRequests = await this.findPullRequestsForCommit(context, deployment.sha);
    
    if (pullRequests.length === 0) {
      Logger.info('No pull requests found for deployment status');
      return { success: true, reason: 'No associated pull requests' };
    }

    // Send notifications for each PR
    const results = [];
    for (const pr of pullRequests) {
      const result = await this.sendDeploymentStatusNotification(context, deploymentInfo, pr);
      results.push(result);
    }

    const successCount = results.filter(r => r.success).length;
    Logger.info(`✅ Sent ${successCount}/${results.length} deployment status notifications`);

    return { 
      success: successCount > 0,
      results: results
    };
  }

  /**
   * Send deployment creation notification
   * @param {Object} context - GitHub context
   * @param {Object} deploymentInfo - Deployment information
   * @param {Object} pullRequest - Pull request object
   * @returns {Promise<Object>} Result object
   */
  async sendDeploymentNotification(context, deploymentInfo, pullRequest) {
    const eventData = {
      deployment: deploymentInfo,
      pullRequest: {
        number: pullRequest.number,
        title: pullRequest.title,
        url: pullRequest.html_url,
        creator: pullRequest.user.login
      },
      repository: {
        name: context.payload.repository.full_name,
        url: context.payload.repository.html_url
      }
    };

    return await this.notificationService.sendNotification(
      context,
      'deployment', 
      'created',
      eventData
    );
  }

  /**
   * Send deployment status notification
   * @param {Object} context - GitHub context
   * @param {Object} deploymentInfo - Deployment information with status
   * @param {Object} pullRequest - Pull request object
   * @returns {Promise<Object>} Result object
   */
  async sendDeploymentStatusNotification(context, deploymentInfo, pullRequest) {
    const eventData = {
      deployment: deploymentInfo,
      pullRequest: {
        number: pullRequest.number,
        title: pullRequest.title,
        url: pullRequest.html_url,
        creator: pullRequest.user.login
      },
      repository: {
        name: context.payload.repository.full_name,
        url: context.payload.repository.html_url
      }
    };

    return await this.notificationService.sendNotification(
      context,
      'deployment_status', 
      deploymentInfo.status,
      eventData
    );
  }

  /**
   * Find pull requests associated with a commit
   * @param {Object} context - GitHub context
   * @param {string} sha - Commit SHA
   * @returns {Promise<Array>} Array of pull request objects
   */
  async findPullRequestsForCommit(context, sha) {
    try {
      const githubService = this.notificationService.githubService;
      const result = await githubService.getPullRequestsForCommit(context, sha);
      
      if (result.success) {
        return result.pullRequests;
      } else {
        Logger.warn(`Failed to find PRs for commit ${sha}: ${result.error}`);
        return [];
      }
    } catch (error) {
      Logger.error(`Error finding PRs for commit ${sha}`, error);
      return [];
    }
  }

  /**
   * Check if this is a duplicate event
   * @param {string} eventKey - Unique event identifier
   * @returns {boolean} True if duplicate
   */
  isDuplicateEvent(eventKey) {
    const now = Date.now();
    const recentTime = 5 * 60 * 1000; // 5 minutes
    
    // Clean old events
    for (const [key, timestamp] of DeploymentHandler.recentEvents.entries()) {
      if (now - timestamp > recentTime) {
        DeploymentHandler.recentEvents.delete(key);
      }
    }
    
    // Check if event is recent
    if (DeploymentHandler.recentEvents.has(eventKey)) {
      return true;
    }
    
    // Track this event
    DeploymentHandler.recentEvents.set(eventKey, now);
    return false;
  }
}