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
    <div class="content">
      <p><strong>${repository}</strong></p>
      ${pullRequest ? `<p><a href="${pullRequest.html_url}">Pull Request #${pullRequest.number}: ${pullRequest.title}</a></p>` : ''}
      
      ${statusInfo?.status ? `<p>Status: ${statusInfo.status}</p>` : ''}
      ${description ? `<p>Description: ${this.escapeHtml(description)}</p>` : ''}
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
        font-family: Arial, sans-serif; 
        margin: 0; 
        padding: 20px; 
        background-color: #ffffff;
        line-height: 1.4;
        color: #333;
      }
      .container { 
        max-width: 500px; 
      }
      .content { 
        padding: 0; 
      }
      h2 {
        color: #0366d6;
        margin-bottom: 20px;
        font-size: 18px;
        text-align: left;
      }
      p {
        margin: 10px 0;
        font-size: 14px;
      }
      a {
        color: #0366d6;
        text-decoration: none;
      }
      a:hover {
        text-decoration: underline;
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
    
    const subjectTemplates = {
      'pull_request.opened': () => 
        `New Pull Request #${pullRequest.number}: ${pullRequest.title}`,
      'pull_request.closed': () => 
        `Pull Request ${pullRequest.merged ? 'Merged' : 'Closed'} #${pullRequest.number}: ${pullRequest.title}`,
      'pull_request.edited': () => 
        `Pull Request Updated #${pullRequest.number}: ${pullRequest.title}`,
      'pull_request.synchronize': () => 
        `New commits pushed to PR #${pullRequest.number}: ${pullRequest.title}`,
      'pull_request_review.submitted': () => 
        `Review ${data.review?.state || 'submitted'} for PR #${pullRequest.number}: ${pullRequest.title}`,
      'check_run.completed': () => 
        `Check run ${statusInfo?.status || 'completed'} for PR #${pullRequest.number}`,
      'push': () => 
        `New commits pushed to PR #${pullRequest.number}: ${pullRequest.title}`
    };

    const eventKey = action ? `${eventType}.${action}` : eventType;
    const template = subjectTemplates[eventKey];
    
    if (template) {
      return template();
    }

    // Fallback generic subject
    return `${eventType}${action ? `.${action}` : ''} notification${pullRequest ? ` - PR #${pullRequest.number}` : ''}`;
  }
}