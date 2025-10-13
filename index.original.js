import nodemailer from 'nodemailer';

/**
 * Configuration helper to check if an event type is enabled
 */
const isEventEnabled = (eventType, action = null) => {
  const envVar = action 
    ? `ENABLE_${eventType.toUpperCase()}_${action.toUpperCase()}`
    : `ENABLE_${eventType.toUpperCase()}`;
  
  const isEnabled = process.env[envVar] === 'true';
  console.log(`DEBUG: Checking if event ${eventType}${action ? `.${action}` : ''} is enabled (${envVar}=${process.env[envVar]}) -> ${isEnabled}`);
  return isEnabled;
};

/**
 * Get notification priority level
 */
const getNotificationPriority = (eventType, action) => {
  // Define priority levels for different events
  const highPriority = [
    'check_run.completed', 'check_suite.completed', 'pull_request.opened',
    'pull_request.closed', 'pull_request_review.submitted', 'deployment_status'
  ];
  
  const mediumPriority = [
    'pull_request.ready_for_review', 'pull_request.review_requested',
    'pull_request.synchronize', 'status', 'push'
  ];
  
  const eventKey = action ? `${eventType}.${action}` : eventType;
  
  if (highPriority.includes(eventKey)) return 'high';
  if (mediumPriority.includes(eventKey)) return 'medium';
  return 'low';
};

/**
 * Check if notification should be sent based on minimum priority
 */
const shouldNotify = (eventType, action) => {
  const minPriority = process.env.NOTIFICATION_MIN_PRIORITY || 'medium';
  const eventPriority = getNotificationPriority(eventType, action);
  
  const priorities = { low: 1, medium: 2, high: 3 };
  const shouldSend = priorities[eventPriority] >= priorities[minPriority];
  
  console.log(`DEBUG: Priority check for ${eventType}${action ? `.${action}` : ''}: event=${eventPriority}, min=${minPriority} -> ${shouldSend ? 'SEND' : 'SKIP'}`);
  return shouldSend;
};

/**
 * Global workflow tracker for debugging
 */
let workflowSteps = ['Steps:'];

/**
 * Add a step to the workflow tracker
 */
const addWorkflowStep = (step, details = null) => {
  workflowSteps.push({
    step,
    details
  });
};

/**
 * Get current workflow steps
 */
const getWorkflowSteps = () => {
  return workflowSteps;
};

/**
 * Reset workflow steps (call at the start of each event)
 */
const resetWorkflowSteps = () => {
  workflowSteps = [];
};

/**
 * Post app workflow steps as a PR comment for debugging
 */
const postWorkflowDebugComment = async (context, pr, eventType, action, emailData = null) => {
  console.log(`DEBUG: postWorkflowDebugComment called - DEBUG_WORKFLOW_STEPS=${process.env.DEBUG_WORKFLOW_STEPS}`);
  
  if (process.env.DEBUG_WORKFLOW_STEPS !== 'true') {
    console.log('DEBUG: Workflow debugging is disabled');
    return; // Workflow debugging disabled
  }

  try {
    const steps = getWorkflowSteps();
    console.log(`DEBUG: About to post comment with ${steps.length} steps for PR #${pr.number}`);

    //debug log all steps
    steps.forEach((step, index) => {
      console.log(`DEBUG: Step ${index + 1}: ${step.step}${step.details ? ` - ${step.details}` : ''}`);
    });

    // Build the email notification section if email data is provided
    const emailSection = emailData ? `

<details><summary>📧 Email Notification Content</summary>

**Subject:** ${emailData.subject}

**Text Content:**
\`\`\`
${emailData.textContent}
\`\`\`

**HTML Content:**
\`\`\`html
${emailData.htmlContent}
\`\`\`

</details>` : '';

    const debugInfo = `## 🔍 PR Notification App Workflow

**Event:** \`${eventType}${action ? `.${action}` : ''}\`
**PR:** #${pr.number} - ${pr.title}

### Processing Steps:
${steps.map((step, index) => {
  return `${index + 1}. ${step.step}${step.details ? ` - ${step.details}` : ''}`;
}).join('\n')}${emailSection}

---
*To disable workflow debugging, set \`DEBUG_WORKFLOW_STEPS=false\`*`;

    console.log(`DEBUG: Comment body created, length: ${debugInfo.length}`);

    // debug the ALL the API call parameters
    console.log(`owner: ${context.payload.repository.owner.login}`);
    console.log(`repo: ${context.payload.repository.name}`);
    console.log(`issue_number: ${pr.number}`);
    console.log(`body length: ${debugInfo.length}`);

    await context.octokit.issues.createComment({
      owner: context.payload.repository.owner.login,
      repo: context.payload.repository.name,
      issue_number: pr.number,
      body: debugInfo
    });

    console.log(`DEBUG: Successfully posted workflow debug comment to PR #${pr.number} for event ${eventType}${action ? `.${action}` : ''}`);
  } catch (error) {
    console.error(`ERROR: Failed to post workflow debug comment to PR #${pr.number}: ${error.message}`);
    console.error(`ERROR: Stack trace:`, error.stack);
  }
};

/**
 * This is the main entrypoint to your Probot app
 * @param {import('probot').Probot} app
 */
export default (app) => {
  app.log.info("PR notification app loaded!");

  // Configure email transporter
  const createEmailTransporter = () => {
    return nodemailer.createTransporter({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: process.env.SMTP_PORT || 587,
      secure: false, // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  };

  // Function to send email notification
  const sendEmailNotification = async (to, subject, htmlContent, textContent, eventType, action) => {
    app.log.info(`INFO: Attempting to send email notification for ${eventType}.${action} to ${to}`);
    
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      app.log.warn('SMTP credentials not configured. Email notification skipped.');
      return;
    }

    if (!shouldNotify(eventType, action)) {
      app.log.info(`Notification skipped for ${eventType}.${action} - below minimum priority level`);
      return;
    }

    try {
      app.log.debug(`DEBUG: Creating email transporter for ${process.env.SMTP_HOST}:${process.env.SMTP_PORT}`);
      const transporter = createEmailTransporter();
      
      const mailOptions = {
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: to,
        subject: subject,
        text: textContent,
        html: htmlContent
      };

      app.log.debug(`DEBUG: Sending email with subject: "${subject}"`);
      const info = await transporter.sendMail(mailOptions);
      app.log.info(`✅ Email sent successfully: ${info.messageId} for ${eventType}.${action} to ${to}`);
      return info;
    } catch (error) {
      app.log.error(`❌ Failed to send email to ${to}: ${error.message}`);
      throw error;
    }
  };

  // Function to get user email with fallback options
  const getUserEmail = async (context, username) => {
    app.log.debug(`DEBUG: Fetching email for user: ${username}`);
    try {
      const { data: user } = await context.octokit.users.getByUsername({
        username: username
      });
      if (user.email) {
        app.log.info(`INFO: Found email for user ${username}: ${user.email}`);
      } else {
        app.log.warn(`WARN: User ${username} has no public email address`);
      }
      return user.email;
    } catch (error) {
      app.log.warn(`Could not fetch email for user ${username}: ${error.message}`);
      return null;
    }
  };

  // Function to get pull requests associated with a commit SHA
  const getPullRequestsForCommit = async (context, sha) => {
    app.log.debug(`DEBUG: Looking for pull requests associated with commit ${sha}`);
    try {
      const { data: pulls } = await context.octokit.repos.listPullRequestsAssociatedWithCommit({
        owner: context.payload.repository.owner.login,
        repo: context.payload.repository.name,
        commit_sha: sha
      });
      app.log.info(`INFO: Found ${pulls.length} pull request(s) for commit ${sha}`);
      pulls.forEach((pr, index) => {
        app.log.debug(`DEBUG: PR ${index + 1}: #${pr.number} - ${pr.title} (${pr.user.login})`);
      });
      return pulls;
    } catch (error) {
      app.log.error(`Failed to get pull requests for commit ${sha}: ${error.message}`);
      return [];
    }
  };

  // Function to format status for email
  const formatStatus = (status, conclusion, emoji_override = null) => {
    app.log.debug(`DEBUG: Formatting status - status: ${status}, conclusion: ${conclusion}, emoji_override: ${emoji_override}`);
    const statusMap = {
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
      completed: { status: 'COMPLETED', emoji: '✅', color: '#28a745' }
    };

    const key = conclusion || status;
    const result = statusMap[key] || { status: (key || 'UNKNOWN').toUpperCase(), emoji: '❓', color: '#6c757d' };
    app.log.debug(`DEBUG: Status mapping - key: ${key}, mapped to: ${result.status} ${result.emoji}`);
    
    if (emoji_override) {
      result.emoji = emoji_override;
      app.log.debug(`DEBUG: Emoji overridden to: ${emoji_override}`);
    }
    
    return result;
  };

  // Function to create email content
  const createEmailContent = (data) => {
    app.log.debug(`DEBUG: Creating email content for event: ${data.event}, repository: ${data.repository}`);
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
    app.log.debug(`DEBUG: Email content parameters - subject: "${subject}", PR: ${pullRequest ? `#${pullRequest.number}` : 'none'}, description length: ${description ? description.length : 0}`);
    app.log.info(`INFO: Generating email content for ${event} event in ${repository}`);

    const textContent = `
${subject}

Repository: ${repository}
${pullRequest ? `Pull Request: #${pullRequest.number} - ${pullRequest.title}` : ''}
Event: ${event}
${description ? `Description: ${description}` : ''}
${summary ? `Summary: ${summary}` : ''}

${detailsUrl ? `Details: ${detailsUrl}` : ''}
${pullRequest ? `Pull Request: ${pullRequest.html_url}` : ''}
    `.trim();

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; margin: 0; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; }
    .header { background-color: ${statusInfo?.color || '#0366d6'}; color: white; padding: 15px; border-radius: 5px 5px 0 0; }
    .content { border: 1px solid #ddd; padding: 20px; border-radius: 0 0 5px 5px; }
    .status { font-size: 24px; font-weight: bold; }
    .details { margin-top: 20px; }
    .button { display: inline-block; padding: 10px 20px; background-color: #0366d6; color: white; text-decoration: none; border-radius: 5px; margin: 5px 0; }
    .summary { background-color: #f6f8fa; padding: 10px; border-radius: 5px; margin: 10px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="status">${statusInfo?.emoji || '📢'} ${event}</div>
    </div>
    <div class="content">
      <h3>Repository: ${repository}</h3>
      ${pullRequest ? `<h4>Pull Request: #${pullRequest.number} - ${pullRequest.title}</h4>` : ''}
      
      <div class="details">
        ${description ? `<p><strong>Description:</strong> ${description}</p>` : ''}
        ${statusInfo?.status ? `<p><strong>Status:</strong> ${statusInfo.status}</p>` : ''}
      </div>

      ${summary ? `
        <div class="summary">
          <h4>Summary:</h4>
          <p>${summary}</p>
        </div>
      ` : ''}

      <div style="margin-top: 20px;">
        ${detailsUrl ? `<a href="${detailsUrl}" class="button">View Details</a>` : ''}
        ${pullRequest ? `<a href="${pullRequest.html_url}" class="button">View Pull Request</a>` : ''}
      </div>
    </div>
  </div>
</body>
</html>
    `.trim();

    app.log.debug(`DEBUG: Email content created - text length: ${textContent.length}, html length: ${htmlContent.length}`);
    return { textContent, htmlContent };
  };

  // Helper function to send PR-related notifications
  const sendPRNotification = async (context, event, action, data, recipients = null) => {
    addWorkflowStep('Event Received', `${event}.${action}`);
    app.log.info(`INFO: Processing PR notification for event ${event}.${action}`);
    
    if (!isEventEnabled(event, action)) {
      addWorkflowStep('Event Disabled', 'Skipping due to configuration');
      app.log.info(`Event ${event}.${action} is disabled`);
      return;
    }
    addWorkflowStep('Event Enabled Check', 'Passed');

    const pr = context.payload.pull_request;
    const repository = context.payload.repository.full_name;
    addWorkflowStep('Extract PR Data', `PR #${pr.number} in ${repository}`);
    app.log.debug(`DEBUG: PR notification details - repository: ${repository}, PR: #${pr.number} "${pr.title}", author: ${pr.user.login}`);

    // Determine recipients
    addWorkflowStep('Start Recipient Discovery', recipients ? 'Using custom recipients' : 'Finding default recipients');
    let emailRecipients = recipients || [];
    app.log.debug(`DEBUG: Determining email recipients - custom recipients: ${recipients ? recipients.length : 0}`);
    if (!recipients) {
      // Default recipients: PR creator and assignees
      const prCreatorEmail = await getUserEmail(context, pr.user.login);
      if (prCreatorEmail) {
        emailRecipients.push(prCreatorEmail);
        addWorkflowStep('Added PR Creator Email', prCreatorEmail);
        app.log.debug(`DEBUG: Added PR creator email: ${prCreatorEmail}`);
      }
      
      // Add assignees if any
      if (pr.assignees?.length > 0) {
        addWorkflowStep('Processing Assignees', `${pr.assignees.length} assignee(s) found`);
        app.log.debug(`DEBUG: Processing ${pr.assignees.length} assignee(s)`);
        for (const assignee of pr.assignees) {
          const assigneeEmail = await getUserEmail(context, assignee.login);
          if (assigneeEmail && !emailRecipients.includes(assigneeEmail)) {
            emailRecipients.push(assigneeEmail);
            addWorkflowStep('Added Assignee Email', `${assignee.login}: ${assigneeEmail}`);
            app.log.debug(`DEBUG: Added assignee email: ${assigneeEmail}`);
          }
        }
      }
    }

    addWorkflowStep('Recipients Found', `${emailRecipients.length} recipient(s): ${emailRecipients.join(', ')}`);
    app.log.info(`INFO: Found ${emailRecipients.length} email recipient(s) for PR #${pr.number}`);
    if (emailRecipients.length === 0) {
      addWorkflowStep('No Recipients', 'Workflow terminated - no email recipients');
      app.log.warn(`No email recipients found for PR #${pr.number}`);
      await postWorkflowDebugComment(context, pr, event, action);
      return;
    }

    addWorkflowStep('Generate Email Content', `Subject: "${data.subject}"`);
    const emailData = createEmailContent({
      subject: data.subject,
      repository,
      pullRequest: pr,
      event: `${event}.${action}`,
      description: data.description,
      detailsUrl: data.detailsUrl,
      statusInfo: data.statusInfo,
      summary: data.summary
    });

    // Send to all recipients
    addWorkflowStep('Start Email Sending', `Sending to ${emailRecipients.length} recipient(s)`);
    app.log.info(`INFO: Sending notifications to ${emailRecipients.length} recipient(s) for ${event}.${action}`);
    
    let successCount = 0;
    let failureCount = 0;
    
    for (const email of emailRecipients) {
      try {
        await sendEmailNotification(
          email, 
          data.subject, 
          emailData.htmlContent, 
          emailData.textContent,
          event,
          action
        );
        successCount++;
        addWorkflowStep('Email Sent Successfully', `To: ${email}`);
        app.log.info(`Notification sent to ${email} for ${event}.${action}`);
      } catch (error) {
        failureCount++;
        addWorkflowStep('Email Send Failed', `To: ${email} - ${error.message}`);
        app.log.error(`Failed to send notification to ${email}: ${error.message}`);
      }
    }
    
    addWorkflowStep('Email Summary', `Success: ${successCount}, Failed: ${failureCount}`);
    
    console.log("calling postWorkflowDebugComment");
    // Post workflow debug comment with email data
    await postWorkflowDebugComment(context, pr, event, action, {
      subject: data.subject,
      textContent: emailData.textContent,
      htmlContent: emailData.htmlContent
    });
  };

  //============= EVENT HANDLERS=============

  // 1. PULL REQUEST EVENTS
  app.on("pull_request.opened", async (context) => {
    resetWorkflowSteps();
    addWorkflowStep('Webhook Received', 'pull_request.opened');
    
    app.log.info(`INFO: WEBHOOK RECEIVED: pull_request.opened`);
    const { pull_request: pr } = context.payload;
    app.log.info(`INFO: New pull request opened - #${pr.number} "${pr.title}" by ${pr.user.login} in ${context.payload.repository.full_name}`);
    
    addWorkflowStep('Format Status', 'Creating opened status with 🎉 emoji');
    const statusInfo = formatStatus('opened', null, '🎉');
    
    await sendPRNotification(context, 'pull_request', 'opened', {
      subject: `🎉 New Pull Request #${pr.number}: ${pr.title}`,
      description: `${pr.user.login} opened a new pull request`,
      detailsUrl: pr.html_url,
      statusInfo,
      summary: pr.body || 'No description provided'
    });
    
    app.log.debug(`DEBUG: Completed processing pull_request.opened for PR #${pr.number}`);
  });

  app.on("pull_request.edited", async (context) => {
    resetWorkflowSteps();
    addWorkflowStep('Webhook Received', 'pull_request.edited');
    
    if (!isEventEnabled('pull_request', 'edited')) {
      addWorkflowStep('Event Disabled', 'Skipping due to configuration');
      return;
    }
    
    const { pull_request: pr } = context.payload;
    addWorkflowStep('Format Status', 'Creating edited status with ✏️ emoji');
    const statusInfo = formatStatus('edited', null, '✏️');
    
    await sendPRNotification(context, 'pull_request', 'edited', {
      subject: `✏️ Pull Request #${pr.number} Updated: ${pr.title}`,
      description: `${pr.user.login} updated the pull request`,
      detailsUrl: pr.html_url,
      statusInfo
    });
  });

  app.on("pull_request.closed", async (context) => {
    resetWorkflowSteps();
    addWorkflowStep('Webhook Received', 'pull_request.closed');
    
    app.log.info(`INFO: WEBHOOK RECEIVED: pull_request.closed`);
    const { pull_request: pr } = context.payload;
    const wasMerged = pr.merged;
    app.log.info(`INFO: Pull request ${wasMerged ? 'merged' : 'closed'} - #${pr.number} "${pr.title}" in ${context.payload.repository.full_name}`);
    if (wasMerged && pr.merged_by) {
      app.log.debug(`DEBUG: Merged by ${pr.merged_by.login}`);
    }
    
    addWorkflowStep('Determine Status', wasMerged ? 'Pull request was merged' : 'Pull request was closed');
    addWorkflowStep('Format Status', `Creating ${wasMerged ? 'merged' : 'closed'} status`);
    const statusInfo = formatStatus('closed', null, wasMerged ? '🎉' : '❌');
    
    await sendPRNotification(context, 'pull_request', 'closed', {
      subject: `${wasMerged ? '🎉 Pull Request Merged' : '❌ Pull Request Closed'} #${pr.number}: ${pr.title}`,
      description: wasMerged 
        ? `Pull request was merged by ${pr.merged_by?.login || 'unknown'}` 
        : `Pull request was closed by ${pr.user.login}`,
      detailsUrl: pr.html_url,
      statusInfo
    });
    
    app.log.debug(`DEBUG: Completed processing pull_request.closed for PR #${pr.number}`);
  });

  app.on("pull_request.reopened", async (context) => {
    resetWorkflowSteps();
    if (!isEventEnabled('pull_request', 'reopened')) return;
    
    const { pull_request: pr } = context.payload;
    const statusInfo = formatStatus('reopened', null, '🔄');
    
    await sendPRNotification(context, 'pull_request', 'reopened', {
      subject: `🔄 Pull Request Reopened #${pr.number}: ${pr.title}`,
      description: `${pr.user.login} reopened the pull request`,
      detailsUrl: pr.html_url,
      statusInfo
    });
  });

  app.on("pull_request.synchronize", async (context) => {
    const { pull_request: pr } = context.payload;
    const statusInfo = formatStatus('synchronize', null, '🔄');
    
    await sendPRNotification(context, 'pull_request', 'synchronize', {
      subject: `🔄 New commits pushed to PR #${pr.number}: ${pr.title}`,
      description: `New commits were pushed to the pull request`,
      detailsUrl: pr.html_url,
      statusInfo
    });
  });

  app.on("pull_request.ready_for_review", async (context) => {
    const { pull_request: pr } = context.payload;
    const statusInfo = formatStatus('ready_for_review', null, '👀');
    
    await sendPRNotification(context, 'pull_request', 'ready_for_review', {
      subject: `👀 Pull Request Ready for Review #${pr.number}: ${pr.title}`,
      description: `Pull request is now ready for review`,
      detailsUrl: pr.html_url,
      statusInfo
    });
  });

  app.on("pull_request.review_requested", async (context) => {
    const { pull_request: pr, requested_reviewer } = context.payload;
    const statusInfo = formatStatus('review_requested', null, '👥');
    
    // Send notification to the requested reviewer
    const reviewerEmail = await getUserEmail(context, requested_reviewer.login);
    const recipients = reviewerEmail ? [reviewerEmail] : [];
    
    await sendPRNotification(context, 'pull_request', 'review_requested', {
      subject: `👥 Review Requested for PR #${pr.number}: ${pr.title}`,
      description: `Review requested from ${requested_reviewer.login}`,
      detailsUrl: pr.html_url,
      statusInfo
    }, recipients);
  });

  // 2. PULL REQUEST REVIEW EVENTS
  app.on("pull_request_review.submitted", async (context) => {
    resetWorkflowSteps();
    addWorkflowStep('Webhook Received', 'pull_request_review.submitted');
    
    app.log.info(`INFO: WEBHOOK RECEIVED: pull_request_review.submitted`);
    const { pull_request: pr, review } = context.payload;
    app.log.info(`INFO: Review submitted - ${review.state} by ${review.user.login} for PR #${pr.number} in ${context.payload.repository.full_name}`);
    app.log.debug(`DEBUG: Review details - ID: ${review.id}, body length: ${review.body ? review.body.length : 0}`);
    
    addWorkflowStep('Extract Review Data', `Review ID: ${review.id}, State: ${review.state}, Reviewer: ${review.user.login}`);
    addWorkflowStep('Format Status', `Creating submitted status for ${review.state} review`);
    const statusInfo = formatStatus('submitted', review.state, '📝');
    
    await sendPRNotification(context, 'pull_request_review', 'submitted', {
      subject: `📝 Review ${review.state} for PR #${pr.number}: ${pr.title}`,
      description: `${review.user.login} submitted a ${review.state} review`,
      detailsUrl: review.html_url,
      statusInfo,
      summary: review.body || 'No review comments'
    });
    
    app.log.debug(`DEBUG: Completed processing pull_request_review.submitted for PR #${pr.number}`);
  });

  app.on("pull_request_review.dismissed", async (context) => {
    if (!isEventEnabled('pull_request_review', 'dismissed')) return;
    
    const { pull_request: pr, review } = context.payload;
    const statusInfo = formatStatus('dismissed', null, '🚫');
    
    await sendPRNotification(context, 'pull_request_review', 'dismissed', {
      subject: `🚫 Review Dismissed for PR #${pr.number}: ${pr.title}`,
      description: `Review from ${review.user.login} was dismissed`,
      detailsUrl: pr.html_url,
      statusInfo
    });
  });

  // 3. PULL REQUEST REVIEW COMMENT EVENTS
  app.on("pull_request_review_comment.created", async (context) => {
    const { pull_request: pr, comment } = context.payload;
    const statusInfo = formatStatus('created', null, '💬');
    
    await sendPRNotification(context, 'pull_request_review_comment', 'created', {
      subject: `💬 New Review Comment on PR #${pr.number}: ${pr.title}`,
      description: `${comment.user.login} added a review comment`,
      detailsUrl: comment.html_url,
      statusInfo,
      summary: comment.body
    });
  });

  // 4. CHECK RUN EVENTS (Enhanced from original)
  app.on("check_run.completed", async (context) => {
    resetWorkflowSteps();
    addWorkflowStep('Webhook Received', 'check_run.completed');
    
    app.log.info(`INFO: WEBHOOK RECEIVED: check_run.completed`);
    const { check_run: checkRun } = context.payload;
    
    app.log.info(`INFO: Check run completed - "${checkRun.name}" with conclusion "${checkRun.conclusion}" for commit ${checkRun.head_sha}`);
    app.log.debug(`DEBUG: Check run details - ID: ${checkRun.id}, status: ${checkRun.status}, started: ${checkRun.started_at}, completed: ${checkRun.completed_at}`);

    addWorkflowStep('Extract Check Run Data', `Name: ${checkRun.name}, Status: ${checkRun.status}, Conclusion: ${checkRun.conclusion}`);

    try {
      // Get pull requests associated with the commit
      addWorkflowStep('Find Associated PRs', `Looking for PRs with commit ${checkRun.head_sha}`);
      const pullRequests = await getPullRequestsForCommit(context, checkRun.head_sha);
      
      if (pullRequests.length === 0) {
        addWorkflowStep('No PRs Found', 'Workflow terminated - no associated pull requests');
        app.log.info(`No pull requests found for commit ${checkRun.head_sha}`);
        return;
      }

      addWorkflowStep('PRs Found', `Found ${pullRequests.length} associated pull request(s)`);

      // Process each pull request
      for (const pr of pullRequests) {
        addWorkflowStep('Processing PR', `PR #${pr.number} - ${pr.title}`);
        
        const userEmail = await getUserEmail(context, pr.user.login);
        if (!userEmail) {
          addWorkflowStep('No Email Found', `Skipping PR #${pr.number} - no email for ${pr.user.login}`);
          app.log.warn(`No email found for user ${pr.user.login}. Skipping notification.`);
          continue;
        }

        addWorkflowStep('User Email Found', `${pr.user.login}: ${userEmail}`);
        
        const statusInfo = formatStatus(checkRun.status, checkRun.conclusion);
        const repository = context.payload.repository.full_name;
        
        addWorkflowStep('Generate Email Content', `Status: ${statusInfo.status} ${statusInfo.emoji}`);
        
        const emailData = createEmailContent({
          subject: `${statusInfo.emoji} Check run ${statusInfo.status} for PR #${pr.number}`,
          repository,
          pullRequest: pr,
          event: 'check_run.completed',
          description: `Check run: ${checkRun.name}`,
          detailsUrl: checkRun.html_url,
          statusInfo,
          summary: checkRun.output?.summary || ''
        });

        try {
          addWorkflowStep('Send Email', `Sending notification to ${userEmail}`);
          await sendEmailNotification(
            userEmail, 
            emailData.subject || `Check run ${statusInfo.status}`,
            emailData.htmlContent, 
            emailData.textContent,
            'check_run',
            'completed'
          );
          addWorkflowStep('Email Sent Successfully', `To: ${userEmail} for PR #${pr.number}`);
          app.log.info(`Check run notification sent to ${userEmail} for PR #${pr.number}`);
          
          addWorkflowStep('Post Workflow Comment', `Adding debug comment to PR #${pr.number}`);
          await postWorkflowDebugComment(context, pr, 'check_run', 'completed', {
            subject: emailData.subject || `Check run ${statusInfo.status}`,
            textContent: emailData.textContent,
            htmlContent: emailData.htmlContent
          });
        } catch (error) {
          addWorkflowStep('Email Send Failed', `Error: ${error.message}`);
          app.log.error(`Failed to send check run notification: ${error.message}`);
        }
      }
    } catch (error) {
      addWorkflowStep('Processing Error', `Error: ${error.message}`);
      app.log.error(`Error processing check run: ${error.message}`);
    }
    
    addWorkflowStep('Check Run Processing Complete', `Finished processing "${checkRun.name}"`);
    app.log.debug(`DEBUG: Completed processing check_run.completed for "${checkRun.name}"`);
  });

  // 5. CHECK SUITE EVENTS
  app.on("check_suite.completed", async (context) => {
    if (!isEventEnabled('check_suite', 'completed')) return;
    
    const { check_suite: checkSuite } = context.payload;
    
    const pullRequests = await getPullRequestsForCommit(context, checkSuite.head_sha);
    
    for (const pr of pullRequests) {
      const userEmail = await getUserEmail(context, pr.user.login);
      if (!userEmail) continue;

      const statusInfo = formatStatus(checkSuite.status, checkSuite.conclusion);
      
      await sendPRNotification(context, 'check_suite', 'completed', {
        subject: `${statusInfo.emoji} All checks ${statusInfo.status} for PR #${pr.number}`,
        description: `Check suite completed with status: ${checkSuite.conclusion}`,
        detailsUrl: pr.html_url,
        statusInfo
      }, [userEmail]);
    }
  });

  // 6. ISSUE COMMENT EVENTS (comments on PRs)
  app.on("issue_comment.created", async (context) => {
    if (!context.payload.issue.pull_request) return; // Only handle PR comments
    
    const { issue, comment } = context.payload;
    const statusInfo = formatStatus('created', null, '💬');
    
    // Get PR details
    const { data: pr } = await context.octokit.pulls.get({
      owner: context.payload.repository.owner.login,
      repo: context.payload.repository.name,
      pull_number: issue.number
    });

    await sendPRNotification(context, 'issue_comment', 'created', {
      subject: `💬 New Comment on PR #${issue.number}: ${issue.title}`,
      description: `${comment.user.login} added a comment`,
      detailsUrl: comment.html_url,
      statusInfo,
      summary: comment.body
    });
  });

  // 7. STATUS EVENTS
  app.on("status", async (context) => {
    if (!isEventEnabled('status')) return;
    
    const { sha, state, description, target_url } = context.payload;
    
    const pullRequests = await getPullRequestsForCommit(context, sha);
    
    for (const pr of pullRequests) {
      const userEmail = await getUserEmail(context, pr.user.login);
      if (!userEmail) continue;

      const statusInfo = formatStatus(null, state);
      
      await sendPRNotification(context, 'status', null, {
        subject: `${statusInfo.emoji} Status Update for PR #${pr.number}`,
        description: description || `Status changed to ${state}`,
        detailsUrl: target_url || pr.html_url,
        statusInfo
      }, [userEmail]);
    }
  });

  // 8. DEPLOYMENT STATUS EVENTS
  app.on("deployment_status", async (context) => {
    if (!isEventEnabled('deployment_status')) return;
    
    const { deployment_status: deployStatus, deployment } = context.payload;
    
    // Find PRs associated with the deployment
    const pullRequests = await getPullRequestsForCommit(context, deployment.sha);
    
    for (const pr of pullRequests) {
      const userEmail = await getUserEmail(context, pr.user.login);
      if (!userEmail) continue;

      const statusInfo = formatStatus(null, deployStatus.state, '🚀');
      
      await sendPRNotification(context, 'deployment_status', null, {
        subject: `🚀 Deployment ${deployStatus.state} for PR #${pr.number}`,
        description: deployStatus.description || `Deployment to ${deployment.environment}`,
        detailsUrl: deployStatus.target_url || pr.html_url,
        statusInfo
      }, [userEmail]);
    }
  });

  // 9. PUSH EVENTS (when new commits are pushed to PR branch)
  app.on("push", async (context) => {
    if (!isEventEnabled('push')) return;
    
    const { ref, commits, pusher } = context.payload;
    
    // Only handle pushes to branches (not tags)
    if (!ref.startsWith('refs/heads/')) return;
    
    const branch = ref.replace('refs/heads/', '');
    
    // Find PRs for this branch
    try {
      const { data: prs } = await context.octokit.pulls.list({
        owner: context.payload.repository.owner.login,
        repo: context.payload.repository.name,
        head: `${context.payload.repository.owner.login}:${branch}`,
        state: 'open'
      });

      for (const pr of prs) {
        const userEmail = await getUserEmail(context, pr.user.login);
        if (!userEmail) continue;

        const statusInfo = formatStatus('push', null, '📝');
        
        await sendPRNotification(context, 'push', null, {
          subject: `📝 New commits pushed to PR #${pr.number}: ${pr.title}`,
          description: `${pusher.name} pushed ${commits.length} commit(s)`,
          detailsUrl: pr.html_url,
          statusInfo,
          summary: commits.map(c => `• ${c.message}`).join('\n')
        }, [userEmail]);
      }
    } catch (error) {
      app.log.error(`Error processing push event: ${error.message}`);
    }
  });

  // Keep the original issues handler for backward compatibility
  app.on("issues.opened", async (context) => {
    const issueComment = context.issue({
      body: "Thanks for opening this issue!",
    });
    return context.octokit.issues.createComment(issueComment);
  });

  app.log.info("INFO: PR NOTIFICATION APP INITIALIZATION");
  app.log.info("PR notification app handlers registered with configurable events!");
  
  // Log configuration status
  app.log.info(`INFO: Notification minimum priority: ${process.env.NOTIFICATION_MIN_PRIORITY || 'medium'}`);
  app.log.info(`INFO: SMTP configuration: ${process.env.SMTP_HOST ? 'configured' : 'not configured'}`);
  if (process.env.SMTP_HOST) {
    app.log.debug(`DEBUG: SMTP Host: ${process.env.SMTP_HOST}, Port: ${process.env.SMTP_PORT || 587}, Secure: ${process.env.SMTP_SECURE || 'false'}`);
    app.log.debug(`DEBUG: SMTP Auth User: ${process.env.SMTP_USER ? 'configured' : 'not configured'}`);
  }
  
  // Log enabled events on startup
  const enabledEvents = [];
  Object.keys(process.env).forEach(key => {
    if (key.startsWith('ENABLE_') && process.env[key] === 'true') {
      enabledEvents.push(key.replace('ENABLE_', '').toLowerCase());
    }
  });
  
  if (enabledEvents.length > 0) {
    app.log.info(`INFO: Enabled events (${enabledEvents.length}): ${enabledEvents.join(', ')}`);
  } else {
    app.log.warn('WARNING: No events explicitly enabled via environment variables');
  }
  
  app.log.info("INFO: APP INITIALIZATION COMPLETE");
};