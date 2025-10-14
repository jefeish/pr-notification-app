# PR Notification Recipients Configuration

The PR notification app **always prioritizes the PR owner/creator** as the primary recipient. This ensures that the person who created or owns the pull request is always informed about events and updates.

## Recipient Priority Order

1. **PR Owner/Creator** (ALWAYS FIRST) - The user who created the PR
2. **Additional Recipients** - Configurable additional users

## Configuration Options

### Controlling Additional Recipients

You can control whether additional recipients are included in notifications:

```bash
# Enable/disable additional recipients (default: true)
NOTIFY_ADDITIONAL_RECIPIENTS=true   # Include assignees, reviewers, and configured recipients
NOTIFY_ADDITIONAL_RECIPIENTS=false  # Only notify PR owner/creator
```

**When `NOTIFY_ADDITIONAL_RECIPIENTS=false`:**

- Only the PR owner/creator receives notifications
- No assignees, reviewers, or configured additional recipients are included
- Custom recipients passed programmatically are still ignored

**When `NOTIFY_ADDITIONAL_RECIPIENTS=true` (default):**

- PR owner/creator receives notifications (always first priority)
- Additional recipients are included based on configuration below

### Environment Variables

You can configure additional recipients using these environment variables:

#### Additional Email Recipients

```bash
# Direct email addresses (comma-separated)
ADDITIONAL_RECIPIENT_EMAILS="lead@company.com,reviewer@company.com"
```

#### Additional GitHub Username Recipients

```bash
# GitHub usernames (comma-separated) - will be resolved to emails
ADDITIONAL_RECIPIENT_USERNAMES="lead,reviewer,senior-dev"
```

### Example Configuration

```bash
# .env file example
ADDITIONAL_RECIPIENT_EMAILS="notifications@company.com,leads@company.com"
ADDITIONAL_RECIPIENT_USERNAMES="project-manager,senior-developer"

# This will result in notifications being sent to:
# 1. PR owner/creator (ALWAYS FIRST)
# 2. notifications@company.com
# 3. leads@company.com  
# 4. project-manager@... (resolved from GitHub)
# 5. senior-developer@... (resolved from GitHub)
```

## Default Additional Recipients (No Configuration)

When no additional recipients are configured, the app will include:

1. **PR Owner/Creator** (always primary)
2. **PR Assignees** (if any)
3. **Requested Reviewers** (if any)

## Custom Recipients (Programmatic)

You can also pass custom recipients when calling the notification service:

```javascript
// Custom recipients - PR owner will still be added automatically
const customRecipients = ['custom@company.com', 'another@company.com'];
await notificationService.sendPRNotification(context, 'pull_request', 'opened', data, customRecipients);
```

## Important Notes

- **PR Owner/Creator is ALWAYS notified** - They are the primary focus of all notifications
- Additional recipients are added to supplement, never replace, the PR owner
- If a PR owner doesn't have a public email, a critical warning is logged
- Duplicate email addresses are automatically filtered out
- Invalid GitHub usernames in configuration are logged as warnings but don't stop the process

## Event Focus

The app focuses on informing users about **events and updates that happen TO a PR**:

- PR opened, closed, merged
- PR edited or updated  
- New commits pushed (synchronize)
- Ready for review
- Review requested
- Check run completions

All notifications ensure the **PR owner/creator knows what's happening to their PR**.
