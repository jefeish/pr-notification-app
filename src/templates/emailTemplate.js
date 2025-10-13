/**
 * @fileoverview Email Template System
 * @description Professional email template system for generating consistent, well-formatted
 * notification emails. Includes HTML templates with CSS styling, plain text alternatives,
 * and dynamic content generation for various GitHub events.
 * 
 * @author Jürgen Efeish
 * 
 * 
 * @module EmailTemplate
 * 
 * @requires DataFormatter - Data formatting utilities
 * 
 * @example
 * // Create email content
 * const emailData = EmailTemplate.createEmailContent({
 *   subject: 'PR Opened',
 *   repository: 'owner/repo',
 *   pullRequest: prObject,
 *   event: 'pull_request.opened',
 *   description: 'New PR created'
 * });
 * 
 * @example
 * // Generate subject line
 * const subject = EmailTemplate.generateSubject('pull_request', 'opened', {
 *   pullRequest: prObject,
 *   statusInfo: { emoji: '🎉' }
 * });
 */

import { DataFormatter } from '../utils/validators.js';

/**
 * @class EmailTemplate
 * @description Email template system for generating consistent notification content.
 * Provides methods for creating both HTML and plain text email content with
 * professional styling and responsive design.
 */
export class EmailTemplate {
  /**
   * Create email content for notifications
   */
  static createEmailContent(data) {
    const { 
      subject, 
      repository, 
      pullRequest, 
      event, 
      description, 
      detailsUrl, 
      statusInfo,
      summary 
    } = data;

    const textContent = this.generateTextContent({
      subject,
      repository,
      pullRequest,
      event,
      description,
      summary,
      detailsUrl
    });

    const htmlContent = this.generateHtmlContent({
      subject,
      repository,
      pullRequest,
      event,
      description,
      summary,
      detailsUrl,
      statusInfo
    });

    return { textContent, htmlContent };
  }

  /**
   * Generate plain text email content
   */
  static generateTextContent({ subject, repository, pullRequest, event, description, summary, detailsUrl }) {
    const sections = [
      subject,
      '',
      `Repository: ${repository}`,
      pullRequest ? `Pull Request: #${pullRequest.number} - ${pullRequest.title}` : null,
      `Event: ${event}`,
      description ? `Description: ${description}` : null,
      summary ? `Summary: ${summary}` : null,
      '',
      detailsUrl ? `Details: ${detailsUrl}` : null,
      pullRequest ? `Pull Request: ${pullRequest.html_url}` : null
    ].filter(Boolean);

    return sections.join('\n').trim();
  }

  /**
   * Generate HTML email content
   */
  static generateHtmlContent({ subject, repository, pullRequest, event, description, summary, detailsUrl, statusInfo }) {
    const backgroundColor = statusInfo?.color || '#0366d6';
    const emoji = statusInfo?.emoji || '📢';

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
  <style>
    ${this.getEmailStyles()}
  </style>
</head>
<body>
  <div class="container">
    <div class="header" style="background-color: ${backgroundColor};">
      <div class="status">${emoji} ${event}</div>
    </div>
    <div class="content">
      <h3 class="repository">Repository: ${repository}</h3>
      ${pullRequest ? `<h4 class="pr-title">Pull Request: #${pullRequest.number} - ${pullRequest.title}</h4>` : ''}
      
      <div class="details">
        ${description ? `<p><strong>Description:</strong> ${this.escapeHtml(description)}</p>` : ''}
        ${statusInfo?.status ? `<p><strong>Status:</strong> ${statusInfo.status}</p>` : ''}
      </div>

      ${summary ? `
        <div class="summary">
          <h4>Summary:</h4>
          <p>${this.escapeHtml(summary)}</p>
        </div>
      ` : ''}

      <div class="buttons">
        ${detailsUrl ? `<a href="${detailsUrl}" class="button">View Details</a>` : ''}
        ${pullRequest ? `<a href="${pullRequest.html_url}" class="button primary">View Pull Request</a>` : ''}
      </div>
    </div>
    <div class="footer">
      <p>This notification was sent by PR Notification App</p>
    </div>
  </div>
</body>
</html>`.trim();
  }

  /**
   * Get email CSS styles
   */
  static getEmailStyles() {
    return `
      body { 
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
        margin: 0; 
        padding: 20px; 
        background-color: #f6f8fa;
        line-height: 1.5;
      }
      .container { 
        max-width: 600px; 
        margin: 0 auto; 
        background-color: white;
        border-radius: 8px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        overflow: hidden;
      }
      .header { 
        color: white; 
        padding: 20px; 
        text-align: center;
      }
      .status { 
        font-size: 24px; 
        font-weight: bold; 
        margin: 0;
      }
      .content { 
        padding: 24px; 
      }
      .repository {
        color: #24292e;
        margin-top: 0;
        margin-bottom: 16px;
      }
      .pr-title {
        color: #0366d6;
        margin-bottom: 20px;
      }
      .details { 
        margin: 20px 0; 
      }
      .details p {
        margin: 8px 0;
        color: #586069;
      }
      .summary { 
        background-color: #f6f8fa; 
        padding: 16px; 
        border-radius: 6px; 
        margin: 20px 0;
        border-left: 4px solid #0366d6;
      }
      .summary h4 {
        margin-top: 0;
        color: #24292e;
      }
      .buttons { 
        margin-top: 24px; 
        text-align: center;
      }
      .button { 
        display: inline-block; 
        padding: 12px 24px; 
        background-color: #fafbfc; 
        color: #24292e; 
        text-decoration: none; 
        border-radius: 6px; 
        margin: 8px; 
        border: 1px solid #d1d5da;
        font-weight: 500;
        transition: background-color 0.2s;
      }
      .button:hover {
        background-color: #f3f4f6;
      }
      .button.primary {
        background-color: #0366d6;
        color: white;
        border-color: #0366d6;
      }
      .button.primary:hover {
        background-color: #0256cc;
      }
      .footer {
        background-color: #f6f8fa;
        padding: 16px;
        text-align: center;
        border-top: 1px solid #e1e4e8;
      }
      .footer p {
        margin: 0;
        color: #586069;
        font-size: 14px;
      }
      @media (max-width: 600px) {
        .container {
          margin: 0;
          border-radius: 0;
        }
        .content {
          padding: 16px;
        }
        .button {
          display: block;
          margin: 8px 0;
        }
      }
    `;
  }

  /**
   * Escape HTML characters
   */
  static escapeHtml(text) {
    if (!text) return '';
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  }

  /**
   * Generate subject line for different event types
   */
  static generateSubject(eventType, action, data) {
    const { pullRequest, statusInfo, checkRun, commits } = data;
    const emoji = statusInfo?.emoji || '📢';
    
    const subjectTemplates = {
      'pull_request.opened': () => 
        `${emoji} New Pull Request #${pullRequest.number}: ${pullRequest.title}`,
      'pull_request.closed': () => 
        `${emoji} Pull Request ${pullRequest.merged ? 'Merged' : 'Closed'} #${pullRequest.number}: ${pullRequest.title}`,
      'pull_request.edited': () => 
        `${emoji} Pull Request Updated #${pullRequest.number}: ${pullRequest.title}`,
      'pull_request.synchronize': () => 
        `${emoji} New commits pushed to PR #${pullRequest.number}: ${pullRequest.title}`,
      'pull_request_review.submitted': () => 
        `${emoji} Review ${data.review?.state || 'submitted'} for PR #${pullRequest.number}: ${pullRequest.title}`,
      'check_run.completed': () => 
        `${emoji} Check run ${statusInfo?.status || 'completed'} for PR #${pullRequest.number}`,
      'push': () => 
        `${emoji} New commits pushed to PR #${pullRequest.number}: ${pullRequest.title}`
    };

    const eventKey = action ? `${eventType}.${action}` : eventType;
    const template = subjectTemplates[eventKey];
    
    if (template) {
      return template();
    }

    // Fallback generic subject
    return `${emoji} ${eventType}${action ? `.${action}` : ''} notification${pullRequest ? ` - PR #${pullRequest.number}` : ''}`;
  }
}