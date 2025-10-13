/**
 * @fileoverview Event Configuration Constants
 * @description Defines priority levels, status mappings, and emoji configurations for
 * different GitHub webhook events. This centralized configuration system enables
 * consistent event handling and notification prioritization across the application.
 * 
 * @author Jürgen Efeish
 * 
 * 
 * @module EventConfig
 * 
 * @example
 * // Check event priority
 * const isHighPriority = EVENT_PRIORITIES.HIGH.includes('pull_request.opened');
 * 
 * @example
 * // Get status formatting
 * const statusInfo = STATUS_MAPPINGS['success'];
 * console.log(`${statusInfo.emoji} ${statusInfo.status}`);
 * 
 * @example
 * // Get event emoji
 * const emoji = EVENT_EMOJIS['pull_request.opened']; // 🎉
 */

/**
 * @constant {Object} EVENT_PRIORITIES
 * @description Event priority mappings organized by priority level.
 * Used to determine notification importance and filtering.
 * 
 * @property {string[]} HIGH - High priority events that require immediate attention
 * @property {string[]} MEDIUM - Medium priority events for regular notifications
 * @property {string[]} LOW - Low priority events for optional notifications
 */
export const EVENT_PRIORITIES = {
  HIGH: [
    'check_run.completed',
    'check_suite.completed', 
    'pull_request.opened',
    'pull_request.closed',
    'pull_request_review.submitted',
    'deployment_status'
  ],
  
  MEDIUM: [
    'pull_request.ready_for_review',
    'pull_request.review_requested',
    'pull_request.synchronize',
    'status',
    'push'
  ],
  
  LOW: [
    'pull_request.edited',
    'pull_request.reopened',
    'pull_request_review.dismissed',
    'pull_request_review_comment.created',
    'issue_comment.created'
  ]
};

/**
 * Priority level mappings
 */
export const PRIORITY_LEVELS = {
  low: 1,
  medium: 2,
  high: 3
};

/**
 * Status mappings for formatting
 */
export const STATUS_MAPPINGS = {
  success: { status: 'SUCCESS', emoji: '✅', color: '#28a745' },
  failure: { status: 'FAILURE', emoji: '❌', color: '#dc3545' },
  cancelled: { status: 'CANCELLED', emoji: '⏹️', color: '#6c757d' },
  timed_out: { status: 'TIMED OUT', emoji: '⏰', color: '#fd7e14' },
  action_required: { status: 'ACTION REQUIRED', emoji: '⚠️', color: '#ffc107' },
  neutral: { status: 'NEUTRAL', emoji: 'ℹ️', color: '#17a2b8' },
  skipped: { status: 'SKIPPED', emoji: '⏭️', color: '#6c757d' },
  pending: { status: 'PENDING', emoji: '🔄', color: '#007bff' },
  queued: { status: 'QUEUED', emoji: '📋', color: '#007bff' },
  in_progress: { status: 'IN PROGRESS', emoji: '🔄', color: '#007bff' },
  completed: { status: 'COMPLETED', emoji: '✅', color: '#28a745' },
  
  // Custom status for specific actions
  opened: { status: 'OPENED', emoji: '🎉', color: '#28a745' },
  edited: { status: 'EDITED', emoji: '✏️', color: '#0366d6' },
  closed: { status: 'CLOSED', emoji: '❌', color: '#dc3545' },
  merged: { status: 'MERGED', emoji: '🎉', color: '#6f42c1' },
  reopened: { status: 'REOPENED', emoji: '🔄', color: '#0366d6' },
  synchronize: { status: 'UPDATED', emoji: '🔄', color: '#0366d6' },
  ready_for_review: { status: 'READY FOR REVIEW', emoji: '👀', color: '#28a745' },
  review_requested: { status: 'REVIEW REQUESTED', emoji: '👥', color: '#0366d6' },
  submitted: { status: 'SUBMITTED', emoji: '📝', color: '#0366d6' },
  dismissed: { status: 'DISMISSED', emoji: '🚫', color: '#dc3545' },
  created: { status: 'CREATED', emoji: '💬', color: '#0366d6' },
  push: { status: 'PUSHED', emoji: '📝', color: '#0366d6' }
};

/**
 * Default emoji mappings for events
 */
export const EVENT_EMOJIS = {
  'pull_request.opened': '🎉',
  'pull_request.closed': '❌',
  'pull_request.merged': '🎉',
  'pull_request.edited': '✏️',
  'pull_request.reopened': '🔄',
  'pull_request.synchronize': '🔄',
  'pull_request.ready_for_review': '👀',
  'pull_request.review_requested': '👥',
  'pull_request_review.submitted': '📝',
  'pull_request_review.dismissed': '🚫',
  'pull_request_review_comment.created': '💬',
  'check_run.completed': '🔍',
  'check_suite.completed': '✅',
  'issue_comment.created': '💬',
  'status': '📊',
  'deployment_status': '🚀',
  'push': '📝'
};