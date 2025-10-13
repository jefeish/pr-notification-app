/**
 * @fileoverview GitHub API Service
 * @description Comprehensive GitHub API service for interacting with repositories,
 * pull requests, users, and commits. Provides abstracted methods for common
 * GitHub operations with error handling and bulk operations support.
 * 
 * @author Jürgen Efeish
 * 
 * @module GitHubService
 * 
 * @requires Logger - Logging utility
 * @requires ErrorHandler - Error handling utility
 * 
 * @example
 * // Get user email
 * const githubService = new GitHubService(app);
 * const result = await githubService.getUserEmail(context, 'username');
 * if (result.success) {
 *   console.log('Email:', result.email);
 * }
 * 
 * @example
 * // Get PRs for commit
 * const prResult = await githubService.getPullRequestsForCommit(context, sha);
 * if (prResult.success) {
 *   console.log(`Found ${prResult.pullRequests.length} PRs`);
 * }
 * 
 * @example
 * // Post comment to PR
 * const commentResult = await githubService.postComment(context, prNumber, body);
 * if (commentResult.success) {
 *   console.log('Comment posted successfully');
 * }
 */

import { Logger } from '../utils/logger.js';
import { ErrorHandler } from '../utils/logger.js';

/**
 * @class GitHubService
 * @description GitHub service for API interactions and repository operations.
 * Provides abstracted methods for common GitHub API calls with comprehensive error handling.
 */
export class GitHubService {
  constructor(app) {
    this.app = app;
  }

  /**
   * Get user email with fallback options
   */
  async getUserEmail(context, username) {
    Logger.debug(`Fetching email for user: ${username}`);
    
    try {
      const { data: user } = await context.octokit.users.getByUsername({
        username: username
      });
      
      if (user.email) {
        Logger.info(`Found email for user ${username}: ${user.email}`);
        return { success: true, email: user.email, source: 'public_profile' };
      } else {
        Logger.warn(`User ${username} has no public email address`);
        return { success: false, reason: 'no_public_email', username };
      }
    } catch (error) {
      Logger.error(`Could not fetch user ${username}`, error);
      return { success: false, reason: 'api_error', error: error.message, username };
    }
  }

  /**
   * Get emails for multiple users
   */
  async getBulkUserEmails(context, usernames) {
    Logger.debug(`Fetching emails for ${usernames.length} users`);
    
    const results = [];
    const validEmails = [];
    
    for (const username of usernames) {
      const result = await this.getUserEmail(context, username);
      results.push(result);
      
      if (result.success) {
        validEmails.push(result.email);
      }
    }
    
    Logger.info(`Found ${validEmails.length}/${usernames.length} valid email addresses`);
    
    return {
      emails: validEmails,
      results,
      summary: {
        total: usernames.length,
        found: validEmails.length,
        missing: usernames.length - validEmails.length
      }
    };
  }

  /**
   * Get emails for multiple users with special priority for PR creator
   * Ensures PR creator is always notified even if no public email
   */
  async getBulkUserEmailsWithCreatorPriority(context, usernames, prCreator) {
    Logger.debug(`Fetching emails for ${usernames.length} users (PR creator: ${prCreator})`);
    
    const results = [];
    const validEmails = [];
    let creatorHandled = false;
    
    for (const username of usernames) {
      const result = await this.getUserEmail(context, username);
      results.push(result);
      
      if (result.success) {
        validEmails.push(result.email);
        if (username === prCreator) {
          creatorHandled = true;
        }
      } else if (username === prCreator) {
        // Special handling for PR creator - try fallback methods
        const fallbackResult = await this.handlePRCreatorEmailFallback(context, username);
        if (fallbackResult.success) {
          validEmails.push(fallbackResult.email);
          results[results.length - 1] = fallbackResult; // Update the last result
          creatorHandled = true;
          Logger.warn(`PR Creator email found via fallback: ${fallbackResult.email} (${fallbackResult.source})`);
        } else {
          Logger.error(`CRITICAL: Cannot find email for PR creator ${username}. PR creator will NOT be notified!`, null, {
            prCreator: username,
            fallbackAttempted: true,
            reason: fallbackResult.reason
          });
        }
      }
    }
    
    // Final check - ensure PR creator notification
    if (!creatorHandled) {
      Logger.error(`CRITICAL: PR Creator ${prCreator} was not processed for notifications!`, null, {
        prCreator: prCreator,
        usernames: usernames,
        totalEmails: validEmails.length
      });
    }
    
    Logger.info(`Found ${validEmails.length}/${usernames.length} valid email addresses (PR creator: ${creatorHandled ? '✓' : '✗'})`);
    
    return {
      emails: validEmails,
      results,
      summary: {
        total: usernames.length,
        found: validEmails.length,
        missing: usernames.length - validEmails.length,
        prCreatorNotified: creatorHandled
      }
    };
  }

  /**
   * Fallback methods to get PR creator email when public email is not available
   */
  async handlePRCreatorEmailFallback(context, username) {
    Logger.info(`Attempting fallback email methods for PR creator: ${username}`);
    
    // Method 1: Check environment variable override for specific users
    const overrideEmail = process.env[`EMAIL_OVERRIDE_${username.toUpperCase()}`];
    if (overrideEmail) {
      Logger.info(`Found override email for ${username}: ${overrideEmail}`);
      return { success: true, email: overrideEmail, source: 'environment_override' };
    }
    
    // Method 2: Use default fallback email if configured
    const defaultCreatorEmail = process.env.DEFAULT_CREATOR_EMAIL;
    if (defaultCreatorEmail) {
      Logger.warn(`Using default creator email for ${username}: ${defaultCreatorEmail}`);
      return { success: true, email: defaultCreatorEmail, source: 'default_fallback' };
    }
    
    // Method 3: Generate email based on username and domain
    const emailDomain = process.env.CREATOR_EMAIL_DOMAIN;
    if (emailDomain) {
      const generatedEmail = `${username}@${emailDomain}`;
      Logger.warn(`Generated email for ${username}: ${generatedEmail}`);
      return { success: true, email: generatedEmail, source: 'domain_generation' };
    }
    
    Logger.error(`All fallback methods failed for PR creator: ${username}`);
    return { 
      success: false, 
      reason: 'all_fallbacks_failed',
      username: username,
      note: 'Configure EMAIL_OVERRIDE_USERNAME, DEFAULT_CREATOR_EMAIL, or CREATOR_EMAIL_DOMAIN'
    };
  }

  /**
   * Get pull requests associated with a commit SHA
   */
  async getPullRequestsForCommit(context, sha) {
    Logger.debug(`Looking for pull requests associated with commit ${sha}`);
    
    try {
      const { data: pulls } = await context.octokit.repos.listPullRequestsAssociatedWithCommit({
        owner: context.payload.repository.owner.login,
        repo: context.payload.repository.name,
        commit_sha: sha
      });
      
      Logger.info(`Found ${pulls.length} pull request(s) for commit ${sha}`);
      
      pulls.forEach((pr, index) => {
        Logger.debug(`PR ${index + 1}: #${pr.number} - ${pr.title} (${pr.user.login})`);
      });
      
      return { success: true, pullRequests: pulls };
    } catch (error) {
      Logger.error(`Failed to get pull requests for commit ${sha}`, error);
      return { success: false, error: error.message, pullRequests: [] };
    }
  }

  /**
   * Get pull request details
   */
  async getPullRequest(context, pullNumber) {
    try {
      const { data: pr } = await context.octokit.pulls.get({
        owner: context.payload.repository.owner.login,
        repo: context.payload.repository.name,
        pull_number: pullNumber
      });
      
      return { success: true, pullRequest: pr };
    } catch (error) {
      Logger.error(`Failed to get pull request #${pullNumber}`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get pull requests for a branch
   */
  async getPullRequestsForBranch(context, branch, state = 'open') {
    Logger.debug(`Looking for ${state} pull requests for branch ${branch}`);
    
    try {
      const { data: prs } = await context.octokit.pulls.list({
        owner: context.payload.repository.owner.login,
        repo: context.payload.repository.name,
        head: `${context.payload.repository.owner.login}:${branch}`,
        state: state
      });
      
      Logger.info(`Found ${prs.length} ${state} pull request(s) for branch ${branch}`);
      return { success: true, pullRequests: prs };
    } catch (error) {
      Logger.error(`Failed to get pull requests for branch ${branch}`, error);
      return { success: false, error: error.message, pullRequests: [] };
    }
  }

  /**
   * Post a comment on a pull request
   */
  async postComment(context, pullNumber, body) {
    Logger.debug(`Posting comment to PR #${pullNumber}, body length: ${body.length}`);
    
    try {
      // Log API call parameters for debugging
      const params = {
        owner: context.payload.repository.owner.login,
        repo: context.payload.repository.name,
        issue_number: pullNumber
      };
      
      Logger.debug('Comment API parameters', params);
      
      const response = await context.octokit.issues.createComment({
        ...params,
        body: body
      });
      
      Logger.info(`Successfully posted comment to PR #${pullNumber}`);
      return { success: true, comment: response.data };
    } catch (error) {
      Logger.error(`Failed to post comment to PR #${pullNumber}`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get repository information
   */
  getRepositoryInfo(context) {
    const repo = context.payload.repository;
    return {
      fullName: repo.full_name,
      name: repo.name,
      owner: repo.owner.login,
      url: repo.html_url,
      isPrivate: repo.private,
      defaultBranch: repo.default_branch
    };
  }

  /**
   * Get pull request recipients (creator and assignees)
   * @deprecated - Use getAdditionalPRRecipients for additional recipients only
   */
  async getPullRequestRecipients(context, pullRequest) {
    Logger.debug(`Getting recipients for PR #${pullRequest.number}`);
    
    const usernames = new Set();
    const prCreator = pullRequest.user.login;
    
    // Add PR creator (always first priority)
    usernames.add(prCreator);
    
    // Add assignees
    if (pullRequest.assignees?.length > 0) {
      pullRequest.assignees.forEach(assignee => usernames.add(assignee.login));
    }
    
    // Add reviewers if requested
    if (pullRequest.requested_reviewers?.length > 0) {
      pullRequest.requested_reviewers.forEach(reviewer => usernames.add(reviewer.login));
    }
    
    Logger.debug(`Found ${usernames.size} unique users for PR #${pullRequest.number}: ${Array.from(usernames).join(', ')}`);
    
    // Get emails for all users with special handling for PR creator
    const emailResults = await this.getBulkUserEmailsWithCreatorPriority(context, Array.from(usernames), prCreator);
    
    return {
      usernames: Array.from(usernames),
      emails: emailResults.emails,
      summary: emailResults.summary
    };
  }

  /**
   * Get additional PR recipients (assignees, reviewers) excluding the PR creator
   * This focuses on getting extra recipients while keeping PR creator as primary
   */
  async getAdditionalPRRecipients(context, pullRequest, prCreator) {
    Logger.debug(`Getting additional recipients for PR #${pullRequest.number} (excluding creator: ${prCreator})`);
    
    const additionalUsernames = new Set();
    
    // Add assignees (excluding PR creator)
    if (pullRequest.assignees?.length > 0) {
      pullRequest.assignees.forEach(assignee => {
        if (assignee.login !== prCreator) {
          additionalUsernames.add(assignee.login);
        }
      });
    }
    
    // Add reviewers if requested (excluding PR creator)
    if (pullRequest.requested_reviewers?.length > 0) {
      pullRequest.requested_reviewers.forEach(reviewer => {
        if (reviewer.login !== prCreator) {
          additionalUsernames.add(reviewer.login);
        }
      });
    }
    
    Logger.debug(`Found ${additionalUsernames.size} additional users for PR #${pullRequest.number}: ${Array.from(additionalUsernames).join(', ') || 'none'}`);
    
    // Get emails for additional users
    const emailResults = await this.getBulkUserEmails(context, Array.from(additionalUsernames));
    
    return {
      usernames: Array.from(additionalUsernames),
      emails: emailResults.emails,
      summary: emailResults.summary
    };
  }

  /**
   * Get specific recipients for different event types
   */
  async getEventSpecificRecipients(context, eventType, eventData) {
    switch (eventType) {
      case 'pull_request_review':
        // For reviews, notify PR author and the reviewer
        const reviewUsers = new Set([eventData.pullRequest.user.login]);
        if (eventData.review?.user?.login) {
          reviewUsers.add(eventData.review.user.login);
        }
        return this.getBulkUserEmails(context, Array.from(reviewUsers));
        
      case 'pull_request.review_requested':
        // For review requests, notify the requested reviewer
        if (eventData.requested_reviewer?.login) {
          return this.getBulkUserEmails(context, [eventData.requested_reviewer.login]);
        }
        break;
        
      default:
        // Default to PR recipients
        return this.getPullRequestRecipients(context, eventData.pullRequest);
    }
    
    return { emails: [], summary: { total: 0, found: 0, missing: 0 } };
  }

  /**
   * Validate GitHub context
   */
  validateContext(context) {
    const errors = [];
    
    if (!context) {
      errors.push('Context is required');
      return { valid: false, errors };
    }
    
    if (!context.octokit) {
      errors.push('Octokit client not available in context');
    }
    
    if (!context.payload) {
      errors.push('Payload not available in context');
    }
    
    if (!context.payload?.repository) {
      errors.push('Repository information not available in payload');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
}