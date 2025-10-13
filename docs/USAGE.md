# PR Notification App Usage Guide

## How It Works

The PR Notification App automatically monitors check runs on your repositories and sends email notifications to pull request creators when checks complete. Here's the workflow:

1. **Check Run Triggers**: When a CI/CD pipeline or any automated check completes on a commit
2. **PR Association**: The app finds pull requests associated with that commit
3. **Email Notification**: Sends detailed email to the PR creator with check run results

## Email Notifications

### What Gets Sent

- **Success Notifications**: ✅ When all checks pass
- **Failure Notifications**: ❌ When checks fail
- **Other States**: Notifications for cancelled, timed out, or action required states

### Email Content

Each notification includes:
- Repository and PR information
- Check run name and status
- Summary of results (if available)
- Direct links to check run details and pull request
- Formatted HTML email with status colors

### Sample Email

```
Subject: ✅ Check run SUCCESS for PR #123

Repository: myorg/myrepo
Pull Request: #123 - Add new feature
Check Run: CI Tests
Status: SUCCESS
Commit: abc1234

Summary: All tests passed successfully (42/42)

[View Check Run Details] [View Pull Request]
```

## Configuration Options

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `APP_ID` | Yes | GitHub App ID |
| `WEBHOOK_SECRET` | Yes | GitHub webhook secret |
| `SMTP_HOST` | Yes | SMTP server hostname |
| `SMTP_PORT` | Yes | SMTP server port |
| `SMTP_USER` | Yes | SMTP username/email |
| `SMTP_PASS` | Yes | SMTP password/app password |
| `SMTP_FROM` | No | From email address (defaults to SMTP_USER) |

### GitHub App Permissions

Required permissions for your GitHub App:
- **Checks**: Read - to receive check run events
- **Contents**: Read - to access commit information
- **Pull requests**: Read - to find associated PRs
- **Metadata**: Read - for repository access

### Webhook Events

Subscribe to these events in your GitHub App:
- `check_run` - Essential for the main functionality
- `issues` - Optional, for backward compatibility

## Troubleshooting

### Common Issues

#### No Emails Being Sent

1. **Check SMTP Configuration**
   ```bash
   # Verify environment variables are set
   echo $SMTP_USER
   echo $SMTP_HOST
   ```

2. **Gmail App Passwords**
   - Use App Passwords, not your regular password
   - Enable 2FA first, then generate App Password

3. **Check Logs**
   ```bash
   # Look for email-related errors
   npm start | grep -i email
   ```

#### User Email Not Found

The app tries to get the PR creator's public email from GitHub. If unavailable:
- Encourage users to make their email public in GitHub settings
- Consider implementing a user mapping system
- Use corporate email patterns (e.g., `username@company.com`)

#### Check Runs Not Triggering

1. **Verify GitHub App Installation**
   - App must be installed on the repository
   - Check webhook deliveries in GitHub App settings

2. **Check Webhook Events**
   - Ensure `check_run` events are enabled
   - Verify webhook URL is correct

3. **Review Logs**
   ```bash
   # Check for webhook reception
   npm start | grep -i "check run"
   ```

### Testing

#### Manual Testing

1. **Create a Test PR**
   - Fork a repository with CI/CD enabled
   - Create a pull request
   - Wait for checks to complete

2. **Check Webhook Delivery**
   - Go to GitHub App settings
   - Check "Recent Deliveries"
   - Verify `check_run` events are being sent

3. **Monitor Logs**
   ```bash
   # Run with debug logging
   LOG_LEVEL=trace npm start
   ```

#### Local Development

```bash
# Use ngrok or smee for webhook testing
npx smee --url https://smee.io/YOUR_CHANNEL --path /webhooks --port 3000
```

## Best Practices

### Security

- Use App Passwords for Gmail (not regular passwords)
- Store sensitive variables in environment files (not in code)
- Regularly rotate SMTP credentials
- Use secure SMTP connections (TLS/SSL)

### Performance

- The app processes check runs efficiently
- Email sending is asynchronous and won't block webhooks
- Failed email attempts are logged for debugging

### Monitoring

- Monitor webhook delivery success rates
- Track email sending success/failure rates
- Set up alerts for failed notifications

## Integration Examples

### With GitHub Actions

```yaml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Run tests
        run: npm test
      # The app will automatically send notifications when this completes
```

### With Other CI Systems

Any CI system that reports status via GitHub's Checks API will trigger notifications:
- CircleCI
- Travis CI
- Jenkins (with GitHub plugins)
- Azure DevOps
- GitLab CI (when mirroring to GitHub)

## Customization

### Email Templates

The email content can be customized by modifying the `htmlContent` and `textContent` in `index.js`. You can:
- Add company branding
- Customize the styling
- Include additional information
- Change the notification conditions

### Filtering

You can add filters to control which notifications are sent:

```javascript
// Example: Only notify for failed checks
if (checkRun.conclusion === 'success') {
  app.log.info('Check passed, skipping notification');
  return;
}

// Example: Skip certain check types
if (checkRun.name.includes('dependabot')) {
  app.log.info('Skipping dependabot check');
  return;
}
```

### User Mapping

For organizations where GitHub emails aren't public:

```javascript
// Add user mapping
const userEmailMap = {
  'githubusername1': 'user1@company.com',
  'githubusername2': 'user2@company.com'
};

userEmail = userEmailMap[pr.user.login] || `${pr.user.login}@company.com`;
```