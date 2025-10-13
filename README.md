# PR Notification App

> A GitHub App built with [Probot](https://github.com/probot/probot) that sends email notifications to PR creators/owners about pull request events and updates

## Features

- **PR Owner Priority**: Always prioritizes PR creator/owner as primary recipient
- **Simple Event Categories**: 5 logical notification categories (no complex individual settings)
- **Review & Comment Tracking**: Notifications for reviews, review comments, and general comments
- **CI/CD Integration**: Check runs and check suites completion notifications
- **Clean Email Content**: Standard HTML email template with no diff snippets
- **Multiple SMTP Support**: Works with Gmail, Outlook, Yahoo, and custom SMTP servers
- **Additional Recipients**: Optionally notify extra teams or users beyond PR owner
- **Audit Logging**: Complete audit trail of all notifications sent

## Setup

### Prerequisites

1. **GitHub App**: Create a GitHub App with the following permissions:
   - Checks: Read
   - Contents: Read
   - Issues: Write
   - Metadata: Read
   - Pull requests: Write
   - Deployments: Read (for deployment notifications)

2. **Email Provider**: Configure SMTP settings for sending emails

3. **Event Configuration**: Configure 5 simple notification categories in `.env`

### Installation

```sh
# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your configuration
# Required: APP_ID, WEBHOOK_SECRET, SMTP_* variables  
# Configure which notification categories to enable (see Configuration below)
```

### PR Creator Notification Guarantee

**🚨 CRITICAL FEATURE**: The app **guarantees** that PR creators are always notified, even if they don't have public email addresses on GitHub.

#### Fallback Email Methods (in priority order):

```env
# Method 1: User-specific email override
EMAIL_OVERRIDE_JOHNDOE=john.doe@company.com
EMAIL_OVERRIDE_ALICE=alice@external.com

# Method 2: Default fallback for all creators without public emails
DEFAULT_CREATOR_EMAIL=pr-notifications@company.com

# Method 3: Generate emails using username + domain
CREATOR_EMAIL_DOMAIN=company.com  # Creates: username@company.com
```

**Behavior:**
- PR creator is **always** the first recipient processed
- If GitHub public email fails, fallback methods are attempted automatically
- Critical errors are logged if PR creator cannot be reached
- Other recipients (assignees, reviewers) are added but never replace the creator

### Email Configuration

The app supports multiple email providers. Configure your SMTP settings in the `.env` file:

#### Gmail Setup

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password  # Use App Password, not regular password
SMTP_FROM=your_email@gmail.com
```

#### Outlook/Hotmail Setup

```env
SMTP_HOST=smtp-mail.outlook.com
SMTP_PORT=587
SMTP_USER=your_email@outlook.com
SMTP_PASS=your_password
SMTP_FROM=your_email@outlook.com
```

### Logging Configuration

The app uses Probot's built-in Pino logger for structured, high-performance logging:

#### Console Logging

```sh
# Fatal/Error level only (minimal output)
LOG_LEVEL=fatal npm start

# Error level and above  
LOG_LEVEL=error npm start

# Warning level and above (errors + warnings)
LOG_LEVEL=warn npm start

# Info level and above (errors + warnings + info) - DEFAULT
npm start
# or explicitly:
LOG_LEVEL=info npm start

# Debug level (errors + warnings + info + debug)
LOG_LEVEL=debug npm start

# Trace level (most verbose, includes RAW payloads)
LOG_LEVEL=trace npm start
```

#### Structured Logging Features

**Probot/Pino Benefits:**
- **JSON Output**: Structured logs for better parsing and analysis
- **Performance**: High-performance logging with minimal overhead  
- **Log Levels**: Proper hierarchical log level filtering
- **Context**: Rich context data automatically included
- **Timestamps**: Precise timestamps with timezone information

**Example Output:**
```json
{"level":30,"time":1697847123456,"pid":12345,"hostname":"localhost","msg":"🎯 CHECK RUN EVENT: build (ID: 123) - completed"}
```

#### File Logging

Probot supports file logging through standard output redirection:

```sh
# Redirect logs to file
npm start > logs/app.log 2>&1

# Debug level with file logging
LOG_LEVEL=debug npm start > logs/debug.log 2>&1

# JSON logs with timestamps (production ready)
LOG_LEVEL=info npm start | tee logs/production.log
```

### Run the App

```sh
# Development
npm start

# Development with debug logging
LOG_LEVEL=debug npm start

# Production
NODE_ENV=production npm start

# Production with file logging
NODE_ENV=production LOG_FILE=./logs/production.log npm start
```

### GitHub App Configuration

1. Create a GitHub App in your organization/account settings
2. Set the webhook URL to your app's endpoint
3. Subscribe to all PR-related events (see `app.yml` for the full list)
4. Install the app on repositories where you want notifications

### Event Configuration

The app uses 5 simple notification categories. Configure in your `.env` file:

```env
# Event Configuration - Simple notification preferences
NOTIFY_PR_LIFECYCLE=true        # opened, closed, reopened  
NOTIFY_PR_REVIEWS=true          # review submitted, dismissed
NOTIFY_PR_COMMENTS=true         # comments on PRs
NOTIFY_CHECK_RESULTS=true       # CI/CD check completions
NOTIFY_PR_UPDATES=false         # synchronize (new commits), edits
```

**What Each Category Includes:**
- **PR_LIFECYCLE**: When PRs are opened, closed, or reopened
- **PR_REVIEWS**: When code reviews are submitted or dismissed  
- **PR_COMMENTS**: Comments added to pull requests
- **CHECK_RESULTS**: CI/CD pipeline completions (success/failure)
- **PR_UPDATES**: New commits pushed, PR edits, ready for review

**Quick Setup Recommendations:**
- **Essential notifications**: Enable LIFECYCLE and REVIEWS only
- **Full monitoring**: Enable all categories except PR_UPDATES
- **Minimal noise**: Disable COMMENTS and PR_UPDATES
- **Comprehensive**: Enable all events you're interested in

## Docker

```sh
# 1. Build container
docker build -t pr-notification-app .

# 2. Start container
docker run -e APP_ID=<app-id> -e PRIVATE_KEY=<pem-value> pr-notification-app
```

## Documentation

Comprehensive documentation is available in the [`docs/`](docs/) directory:

- **[Usage Guide](docs/USAGE.md)** - Detailed usage instructions and examples
- **[Architecture Overview](docs/entity-relationship-diagram.md)** - System architecture and component relationships
- **[Event Configuration](docs/EVENT_CONFIGURATION.md)** - Complete guide to configuring GitHub webhooks
- **[Implementation Details](docs/IMPLEMENTATION_SUMMARY.md)** - Technical implementation documentation
- **[API Documentation](docs/DOCUMENTATION_SUMMARY.md)** - Complete JSDoc API reference

For a complete list of available documentation, see the [Documentation Index](docs/README.md).

## Contributing

If you have suggestions for how pr-notification-app could be improved, or want to report a bug, open an issue! We'd love all and any contributions.

For more, check out the [Contributing Guide](docs/CONTRIBUTING.md).

## License

[ISC](LICENSE) © 2025 Jürgen Efeish
