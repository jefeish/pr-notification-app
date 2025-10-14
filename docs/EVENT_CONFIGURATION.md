# Event Configuration Guide

This document explains the 5 simple notification categories available in the PR Notification App.

## Notification Categories

The app uses logical categories instead of individual event toggles for easier configuration:

### NOTIFY_PR_LIFECYCLE
**Controls**: Pull request lifecycle events
- `pull_request.opened` - When a new PR is created
- `pull_request.closed` - When a PR is closed or merged  
- `pull_request.reopened` - When a closed PR is reopened

**Default**: `true`  
**Recommendation**: Always keep enabled for essential PR tracking

### NOTIFY_PR_REVIEWS
**Controls**: Code review events
- `pull_request_review.submitted` - When a review is submitted (approved/changes requested/commented)
- `pull_request_review.dismissed` - When a review is dismissed

**Default**: `true`  
**Recommendation**: Keep enabled for code review workflows

### NOTIFY_PR_COMMENTS
**Controls**: Comment events on pull requests
- `issue_comment.created` - When a general comment is added to the PR
- `pull_request_review_comment.created` - When a review comment is added to specific code

**Default**: `true`  
**Recommendation**: Disable if comments create too much notification noise

### NOTIFY_CHECK_RESULTS
**Controls**: CI/CD pipeline completion events
- `check_run.completed` - When individual checks complete (success/failure)
- `check_suite.completed` - When entire check suite completes

**Default**: `true`  
**Recommendation**: Keep enabled to track build/test results

### NOTIFY_PR_UPDATES  
**Controls**: PR update events (often noisy)
- `pull_request.synchronize` - When new commits are pushed
- `pull_request.edited` - When PR title/description is modified
- `pull_request.ready_for_review` - When draft becomes ready for review
- `pull_request.review_requested` - When someone is asked to review

**Default**: `false`  
**Recommendation**: Enable only if you want notifications for every commit push

### NOTIFY_DEPLOYMENTS
**Controls**: Deployment events and status updates
- `deployment.created` - When a deployment is initiated
- `deployment_status` - When deployment completes (success/failure)

**Default**: `true`  
**Recommendation**: Keep enabled to track deployment results

## Configuration Examples

### Minimal Setup (Essential notifications only)

```env
# Just PR lifecycle and reviews
NOTIFY_PR_LIFECYCLE=true
NOTIFY_PR_REVIEWS=true
NOTIFY_PR_COMMENTS=false
NOTIFY_CHECK_RESULTS=false
NOTIFY_PR_UPDATES=false
NOTIFY_DEPLOYMENTS=false
```

### Balanced Setup (Recommended)

```env
# Most important events without noise
NOTIFY_PR_LIFECYCLE=true
NOTIFY_PR_REVIEWS=true
NOTIFY_PR_COMMENTS=true
NOTIFY_CHECK_RESULTS=true
NOTIFY_PR_UPDATES=false
NOTIFY_DEPLOYMENTS=true
```

### Maximum Monitoring

```env
# All events enabled
NOTIFY_PR_LIFECYCLE=true
NOTIFY_PR_REVIEWS=true
NOTIFY_PR_COMMENTS=true
NOTIFY_CHECK_RESULTS=true
NOTIFY_PR_UPDATES=true
ENABLE_PR_READY_FOR_REVIEW=true
ENABLE_PR_REVIEW_REQUESTED=true
ENABLE_PR_REVIEW_SUBMITTED=true
ENABLE_PR_REVIEW_DISMISSED=true
ENABLE_CHECK_RUN_COMPLETED=true
```

## Troubleshooting

### Too Many Notifications?

1. Disable less important event categories (e.g., `NOTIFY_PR_UPDATES=false`)
2. Turn off comment notifications if too noisy: `NOTIFY_PR_COMMENTS=false`
3. Disable check results if not needed: `NOTIFY_CHECK_RESULTS=false`

### Missing Important Notifications?

1. Check that the event category is enabled in your `.env` file
2. Verify the event is listed in `app.yml` under `default_events`
3. Check logs for any error messages

### Email Issues?

1. Verify SMTP credentials are correct
2. Check that users have public email addresses in their GitHub profiles
3. Review email server logs for delivery issues

## Testing Configuration

To test your configuration:

1. **Create a test PR** in a repository with the app installed
2. **Perform actions** that should trigger notifications (push commits, add reviews, etc.)
3. **Check logs** for event processing:

   ```bash
   npm start | grep -E "(Event|notification|Email sent)"
   ```

4. **Monitor webhook delivery** in GitHub App settings

## Configuration Validation

The app logs all enabled events on startup. Look for:

```text
INFO: Notification categories enabled: PR_LIFECYCLE, PR_REVIEWS, PR_COMMENTS, CHECK_RESULTS
```

If you see "No events explicitly enabled", check your `.env` file syntax and ensure variables are set to `true`.