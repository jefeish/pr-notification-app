/**
 * @fileoverview Check Run Event Handler
 * @description Handler for GitHub check run events (CI/CD completion notifications).
 * Processes check run completed events and sends appropriate notifications to PR creators
 * and reviewers about build status, test results, and deployment information.
 * 
 * @author Jürgen Efeish
 * 
 * @module CheckRunHandler
 * @extends BaseHandler
 * 
 * @requires BaseHandler - Base event handler class
 * @requires Logger - Logging utility
 * 
 * @example
 * // Usage via EventHandlerFactory
 * const handler = EventHandlerFactory.createHandler('check_run', notificationService);
 * const result = await handler.handle(context, 'completed');
 * 
 * @example
 * // Register with factory
 * EventHandlerFactory.register('check_run', CheckRunHandler);
 */

import { BaseHandler } from './baseHandler.js';
import { Logger } from '../utils/logger.js';

/**
 * @class CheckRunHandler
 * @extends BaseHandler
 * @description Handler for GitHub check run events.
 * Processes CI/CD completion events and sends notifications about build status.
 */
export class CheckRunHandler extends BaseHandler {
  constructor(notificationService) {
    super(notificationService);
    // Static tracking for event deduplication
    if (!CheckRunHandler.recentEvents) {
      CheckRunHandler.recentEvents = new Map();
    }
  }

  /**
   * Handle check run and check suite events
   * @param {Object} context - GitHub webhook context
   * @param {string} action - Event action (completed, created, etc.)
   * @returns {Promise<Object>} Result object with success status
   */
  async handle(context, action) {
    const repo = context.payload.repository?.full_name || 'unknown';
    const eventType = context.payload.check_suite ? 'check_suite' : 'check_run';
    Logger.info(`WEBHOOK RECEIVED: ${eventType}.${action} in ${repo}`);
    
    if (eventType === 'check_suite') {
      return this.handleCheckSuite(context, action);
    }
    
    return this.handleCheckRun(context, action);
  }

  /**
   * Handle check run events
   * @param {Object} context - GitHub webhook context
   * @param {string} action - Event action (completed, created, etc.)
   * @returns {Promise<Object>} Result object with success status
   */
  async handleCheckRun(context, action) {
    const repo = context.payload.repository?.full_name || 'unknown';

    // Extract check run data from payload
    const checkRun = context.payload.check_run;
    if (!checkRun) {
      Logger.error('No check_run data found in payload');
      return { success: false, error: 'Missing check_run data' };
    }

    // Debug: Event identification and deduplication tracking
    const eventKey = `${checkRun.head_sha}-${checkRun.name}-${action}`;
    const eventId = `${checkRun.id}-${action}-${Date.now()}`;
    Logger.info(`🎯 CHECK RUN EVENT: "${checkRun.name}" (ID: ${checkRun.id}) - ${action}`);
    Logger.debug(`Event Key: ${eventKey} | Event ID: ${eventId}`);
    
    // Track recent events for analysis
    const now = Date.now();
    CheckRunHandler.recentEvents.set(eventKey, {
      timestamp: now,
      checkRunId: checkRun.id,
      checkRunName: checkRun.name,
      action: action,
      headSha: checkRun.head_sha
    });
    
    // Clean old events (older than 5 minutes)
    const fiveMinutesAgo = now - (5 * 60 * 1000);
    for (const [key, event] of CheckRunHandler.recentEvents.entries()) {
      if (event.timestamp < fiveMinutesAgo) {
        CheckRunHandler.recentEvents.delete(key);
      }
    }
    
    Logger.debug(`Recent events tracked: ${CheckRunHandler.recentEvents.size}`);
    
    // Debug: Show all recent events for this commit
    const eventsForThisCommit = Array.from(CheckRunHandler.recentEvents.entries())
      .filter(([key, event]) => event.headSha === checkRun.head_sha);
    
    Logger.debug('=============== EVENTS FOR THIS COMMIT ===============');
    Logger.debug(`Commit SHA: ${checkRun.head_sha.substring(0, 8)}`);
    Logger.debug(`Events for this commit: ${eventsForThisCommit.length}`);
    eventsForThisCommit.forEach(([key, event], index) => {
      Logger.debug(`${index + 1}. ${event.checkRunName} (${event.action}) - ${new Date(event.timestamp).toISOString()}`);
    });
    Logger.debug('===================================================');
    
    // Trace: Log the complete check run event payload - RAW FORMAT (TRACE level only)
    Logger.trace('================== RAW CHECK RUN EVENT PAYLOAD ==================');
    if (process.env.LOG_LEVEL?.toLowerCase() === 'trace') {
      Logger.debug  ('\n' + JSON.stringify(context.payload, null, 2) + '\n');
    }
    Logger.trace('=================================================================');

    try {
      const pullRequests = context.payload.check_run.pull_requests || [];

      Logger.info(`Processing check run: ${checkRun.name} - ${checkRun.status}/${checkRun.conclusion}`);
      
      // Trace: RAW Check Run Object
      Logger.trace('==================== RAW CHECK RUN OBJECT ====================');
      if (process.env.LOG_LEVEL?.toLowerCase() === 'trace') {
        Logger.debug  ('\n📋 CHECK RUN RAW DATA:\n' + JSON.stringify(checkRun, null, 2));
      }
      Logger.trace('==============================================================');

      // Debug: RAW Pull Requests Array  
      Logger.debug('================== RAW PULL REQUESTS ARRAY ==================');
      Logger.debug  ('\n🔗 PULL REQUESTS RAW DATA:\n' + JSON.stringify(pullRequests, null, 2));
      Logger.debug('=============================================================');

      // Debug: RAW Repository Object
      Logger.debug('=================== RAW REPOSITORY DATA ===================');
      Logger.debug  ('\n🏪 REPOSITORY RAW DATA:\n' + JSON.stringify(context.payload.repository, null, 2));
      Logger.debug('===========================================================');
      
      // Debug: RAW Installation & Context
      Logger.debug('================ RAW WEBHOOK CONTEXT DATA ================');
      Logger.debug  ('\n🎯 WEBHOOK CONTEXT:\n' + JSON.stringify({
        action: action,
        event_name: context.name,
        delivery_id: context.id,
        installation: context.payload.installation
      }, null, 2));
      Logger.debug('==========================================================');

      // Fetch all check runs for this commit to get complete status
      const commitSha = checkRun.head_sha;
      Logger.debug(`Fetching all check runs for commit: ${commitSha}`);
      
      const allCheckRuns = await this.getAllCheckRuns(context, commitSha);
      const checkRunSummary = this.analyzeCheckRuns(allCheckRuns, checkRun.name);

      // Only process completed check runs
      if (action !== 'completed') {
        Logger.debug(`Skipping non-completed check run: ${action}`);
        return { success: false, reason: `Action '${action}' not processed` };
      }

      // Only process if associated with pull requests
      if (pullRequests.length === 0) {
        Logger.debug('Check run not associated with any pull requests');
        return { success: false, reason: 'No associated pull requests' };
      }

      // Process notifications for each associated PR
      const results = [];
      for (const pr of pullRequests) {
        try {
          Logger.info(`Processing check run notification for PR #${pr.number}`);
          
          // Fetch complete PR data since check_run PR data is minimal
          Logger.debug(`Fetching complete PR data for #${pr.number}`);
          let fullPR;
          try {
            fullPR = await context.octokit.pulls.get({
              owner: context.payload.repository.owner.login,
              repo: context.payload.repository.name,
              pull_number: pr.number
            });
          } catch (apiError) {
            Logger.error(`Failed to fetch PR #${pr.number} data`, apiError);
            results.push({ success: false, error: `Failed to fetch PR data: ${apiError.message}` });
            continue;
          }
          
          const notificationData = {
            subject: this.formatCheckRunSubject(checkRunSummary, checkRun.name, pr.number),
            description: this.formatCheckRunSummaryDescription(checkRunSummary, checkRun),
            detailsUrl: fullPR.data.html_url, // Link to PR instead of individual check run
            statusInfo: {
              status: checkRunSummary.allCompleted 
                ? (checkRunSummary.failed > 0 ? 'CHECKS FAILED' : 'CHECKS PASSED')
                : 'CHECKS IN PROGRESS'
            }
          };

          // Create a modified context that includes complete PR information
          const prContext = {
            ...context,
            payload: {
              ...context.payload,
              pull_request: fullPR.data
            }
          };

          const result = await this.notificationService.sendPRNotification(
            prContext,
            'check_run',
            'completed',
            notificationData
          );

          results.push(result);

          // Check if successful checks made the PR ready to merge
          if (checkRun.conclusion === 'success') {
            try {
              Logger.info(`✅ Check "${checkRun.name}" succeeded for PR #${pr.number} - checking mergeable state`);
              // Import PullRequestHandler to access the ready-to-merge method
              const { PullRequestHandler } = await import('./pullRequestHandler.js');
              const prHandler = new PullRequestHandler(this.notificationService);
              await prHandler.checkAndNotifyReadyToMerge(prContext, fullPR.data, 'check_success');
            } catch (error) {
              Logger.warn(`Failed to check ready-to-merge status after successful check: ${error.message}`);
            }
          }
        } catch (error) {
          Logger.error(`Error processing check run for PR #${pr.number}`, error);
          results.push({ success: false, error: error.message });
        }
      }

      const successCount = results.filter(r => r.success).length;
      const totalCount = results.length;

      const status = successCount === totalCount ? 'SUCCESS' : 'FAILED';
      Logger.info(`NOTIFICATION PROCESSING: check_run.${action} - ${status} (${successCount}/${totalCount})`);

      return {
        success: successCount > 0,
        processed: successCount,
        total: totalCount,
        reason: successCount === 0 ? 'No notifications sent' : undefined
      };

    } catch (error) {
      Logger.error('Error in CheckRunHandler', error);
      Logger.info(`NOTIFICATION PROCESSING: check_run.${action} - FAILED`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Format check run description for notifications
   */
  formatCheckRunDescription(checkRun) {
    const status = checkRun.conclusion || checkRun.status;
    const emoji = this.getCheckRunEmoji(status);
    
    let description = `${emoji} **${checkRun.name}** ${status}`;
    
    if (checkRun.output && checkRun.output.summary) {
      description += `\\n\\n${checkRun.output.summary}`;
    }
    
    return description;
  }

  /**
   * Get emoji for check run status
   */
  getCheckRunEmoji(status) {
    const emojiMap = {
      'success': '✅',
      'failure': '❌', 
      'cancelled': '⚪',
      'neutral': '⚪',
      'skipped': '⏭️',
      'timed_out': '⏰',
      'action_required': '⚠️'
    };
    
    return emojiMap[status] || '🔄';
  }



  /**
   * Fetch all check runs for a specific commit
   */
  async getAllCheckRuns(context, commitSha) {
    try {
      const response = await context.octokit.checks.listForRef({
        owner: context.payload.repository.owner.login,
        repo: context.payload.repository.name,
        ref: commitSha
      });
      
      Logger.debug(`Found ${response.data.check_runs.length} check runs for commit ${commitSha}`);
      return response.data.check_runs;
    } catch (error) {
      Logger.error(`Failed to fetch check runs for commit ${commitSha}`, error);
      return [];
    }
  }

  /**
   * Analyze all check runs and create summary
   */
  analyzeCheckRuns(allCheckRuns, triggeringCheckName) {
    const completed = allCheckRuns.filter(run => run.status === 'completed');
    const inProgress = allCheckRuns.filter(run => run.status !== 'completed');
    
    const passed = completed.filter(run => run.conclusion === 'success');
    const failed = completed.filter(run => ['failure', 'timed_out', 'action_required'].includes(run.conclusion));
    const skipped = completed.filter(run => ['skipped', 'neutral', 'cancelled'].includes(run.conclusion));

    const summary = {
      total: allCheckRuns.length,
      completed: completed.length,
      inProgress: inProgress.length,
      passed: passed.length,
      failed: failed.length,
      skipped: skipped.length,
      triggeringCheck: triggeringCheckName,
      allCompleted: inProgress.length === 0,
      passedChecks: passed.map(run => ({ name: run.name, url: run.html_url })),
      failedChecks: failed.map(run => ({ name: run.name, url: run.html_url, conclusion: run.conclusion })),
      inProgressChecks: inProgress.map(run => ({ name: run.name, status: run.status }))
    };

    Logger.debug('Check run summary:', summary);
    return summary;
  }

  /**
   * Format subject line for check run summary
   */
  formatCheckRunSubject(summary, triggeringCheckName, prNumber = null) {
    const prPrefix = prNumber ? `PR #${prNumber} - ` : '';
    
    if (summary.allCompleted) {
      if (summary.failed > 0 && summary.passed > 0) {
        return `${prPrefix}Checks: ${summary.failed} failed, ${summary.passed} passed`;
      } else if (summary.failed > 0) {
        return `${prPrefix}Checks: ${summary.failed} failed`;
      } else if (summary.passed > 0) {
        return `${prPrefix}Checks: ${summary.passed} passed`;
      } else {
        return `${prPrefix}Checks: completed`;
      }
    } else {
      return `${prPrefix}Checks: ${triggeringCheckName} completed (${summary.inProgress} still running)`;
    }
  }

  /**
   * Format comprehensive description with all check statuses
   */
  formatCheckRunSummaryDescription(summary, currentCheckRun) {
    // Simple summary since detailed info is in the table
    if (summary.allCompleted) {
      if (summary.failed > 0) {
        return `${summary.failed} check${summary.failed > 1 ? 's' : ''} failed, ${summary.passed} passed`;
      } else if (summary.passed > 0) {
        return `All ${summary.passed} check${summary.passed > 1 ? 's' : ''} passed successfully`;
      } else {
        return `All checks completed`;
      }
    } else {
      return `${currentCheckRun.name} completed - ${summary.inProgress} check${summary.inProgress > 1 ? 's' : ''} still running`;
    }
  }

  /**
   * Handle check suite completion events
   * @param {Object} context - GitHub webhook context
   * @param {string} action - Event action (completed)
   * @returns {Promise<Object>} Result object with success status
   */
  async handleCheckSuite(context, action) {
    const checkSuite = context.payload.check_suite;
    if (!checkSuite) {
      Logger.error('No check_suite data found in payload');
      return { success: false, error: 'Missing check_suite data' };
    }

    Logger.info(`🏁 CHECK SUITE ${action.toUpperCase()}: ${checkSuite.app?.name || 'Unknown App'} (ID: ${checkSuite.id})`);
    Logger.debug(`Suite Status: ${checkSuite.status}, Conclusion: ${checkSuite.conclusion}`);

    if (action !== 'completed') {
      Logger.debug(`Ignoring check_suite.${action} - only handling completed suites`);
      return { success: true, reason: 'non_completed_suite' };
    }

    // When a check suite completes, check if any associated PRs became ready to merge
    try {
      const prs = checkSuite.pull_requests || [];
      
      if (prs.length === 0) {
        Logger.debug('No pull requests associated with this check suite');
        return { success: true, reason: 'no_associated_prs' };
      }

      Logger.info(`Check suite completion affects ${prs.length} PR(s)`);
      
      const results = [];
      for (const pr of prs) {
        try {
          Logger.debug(`Checking if PR #${pr.number} became ready to merge after check suite completion`);
          
          // Create PR context for the ready-to-merge check
          const prContext = {
            ...context,
            payload: {
              ...context.payload,
              repository: context.payload.repository
            }
          };

          Logger.info(`🏁 Check suite completed for PR #${pr.number} - checking mergeable state`);
          // Import PullRequestHandler to access the ready-to-merge method
          const { PullRequestHandler } = await import('./pullRequestHandler.js');
          const prHandler = new PullRequestHandler(this.notificationService);
          
          const result = await prHandler.checkAndNotifyReadyToMerge(prContext, pr, 'check_suite_completed');
          results.push({ prNumber: pr.number, result });
          
        } catch (error) {
          Logger.error(`Error checking PR #${pr.number} ready-to-merge status after check suite completion`, error);
          results.push({ prNumber: pr.number, result: { success: false, error: error.message } });
        }
      }

      const successCount = results.filter(r => r.result.success).length;
      Logger.info(`Check suite ready-to-merge notifications: ${successCount}/${results.length} successful`);

      return {
        success: true,
        reason: 'check_suite_processed',
        processedPRs: results.length,
        successfulNotifications: successCount,
        checkSuite: {
          id: checkSuite.id,
          app: checkSuite.app?.name,
          status: checkSuite.status,
          conclusion: checkSuite.conclusion
        }
      };

    } catch (error) {
      Logger.error('Error processing check suite completion for ready-to-merge notifications', error);
      return { success: false, error: error.message };
    }
  }


}