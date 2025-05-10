# Email System for Multi-Tenant SaaS Platform

This document outlines the email system implementation for the multi-tenant SaaS platform. The system provides transactional email capabilities for various platform operations like tenant onboarding, password reset, account notifications, and user invitations.

## Architecture Overview

The email system consists of:

1. **Email Service**: A centralized service for sending emails with template support
2. **Email Templates**: HTML templates with Handlebars syntax for dynamic content
3. **Controller Integration**: Email sending logic integrated into controllers

## Configuration

The email system uses the following environment variables:

```
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-password
EMAIL_FROM=your-email@gmail.com
EMAIL_FROM_NAME=Multi-Tenant App
```

You can modify these in your `.env` file. For Gmail, you'll need to use an App Password rather than your regular password if you have 2FA enabled.

## Email Service API

The `emailService` provides the following methods:

### `sendMail(options)`

Sends a basic email with the provided options.

```javascript
await emailService.sendMail({
  to: 'recipient@example.com',
  subject: 'Hello World',
  text: 'Plain text version',
  html: '<p>HTML version</p>'
});
```

### `sendTemplateEmail(options)`

Sends an email using a template.

```javascript
await emailService.sendTemplateEmail({
  to: 'recipient@example.com',
  subject: 'Welcome to Our Platform',
  templateName: 'welcome',
  templateData: {
    firstName: 'John',
    companyName: 'Acme Inc.',
    year: new Date().getFullYear()
  }
});
```

### Specialized Methods

The service also provides specialized methods for common email scenarios:

- `sendTenantWelcomeEmail(tenant, user, password)`
- `sendPasswordResetEmail(user, resetToken, tenant)`
- `sendTenantSuspensionEmail(tenant, user, reason)`
- `sendUserInvitationEmail(user, inviteToken, tenant, inviter)`

## Email Templates

Templates are stored in the `templates/emails/` directory as HTML files. They use Handlebars syntax for dynamic content.

### Available Templates

1. **tenant-welcome.html**: Sent to new tenant administrators
2. **password-reset.html**: Sent when a user requests a password reset
3. **password-changed.html**: Confirmation after a password is changed
4. **tenant-suspension.html**: Notification of tenant account suspension
5. **tenant-restoration.html**: Notification when a suspended tenant is restored
6. **user-invitation.html**: Invitation for a new user to join a tenant

### Template Variables

Each template has its own set of variables. Here are some common ones:

- `firstName`: User's first name
- `tenantName`: Name of the tenant
- `subdomain`: Tenant's subdomain
- `loginUrl`: URL for logging in
- `year`: Current year for copyright notices

## Integration Points

The email system is integrated at the following points:

1. **Tenant Creation**: Welcome email to tenant admin
2. **Password Reset**: Reset link email and confirmation email
3. **Tenant Suspension/Restoration**: Notification emails to tenant admins
4. **User Invitation**: Invitation emails to new users

## Testing Emails

To test the email system, you can use:

1. **Real SMTP Server**: Configure with your actual SMTP settings
2. **Ethereal Email**: For development testing without sending real emails
3. **Email Preview**: Display email content in logs instead of sending

To preview emails without sending:

```javascript
// In emailService.js, add this method
async previewEmail(options) {
  const { html, text } = await this.prepareEmail(options);
  console.log('EMAIL PREVIEW:');
  console.log('To:', options.to);
  console.log('Subject:', options.subject);
  console.log('HTML:', html);
  return { html, text };
}
```

## Adding New Email Templates

To add a new email template:

1. Create a new HTML file in `templates/emails/`
2. Use Handlebars syntax for dynamic content: `{{variableName}}`
3. (Optional) Add a specialized method to the `emailService` for your new template
4. Integrate the email sending in the appropriate controller

## Multi-tenancy Considerations

For multi-tenant scenarios:

1. Templates can include conditional tenant-specific branding using `{{#if tenantName}}` syntax
2. Login URLs are generated with the tenant's subdomain
3. Emails are tracked in both tenant-specific and master audit logs

## Security Best Practices

The email system follows these security practices:

1. **No Sensitive Data**: Passwords are never included in emails except for initial tenant admin setup
2. **Limited Token Lifetimes**: Reset and invitation tokens have short expiration times
3. **Email Verification**: Important actions require email verification
4. **Rate Limiting**: Password reset and invitation emails are rate-limited
5. **Audit Logging**: All email sending events are logged

## Implementation Details

The email system uses:

- **Nodemailer**: For sending emails via SMTP
- **Handlebars**: For template rendering
- **Async Design**: All email operations are asynchronous and non-blocking

## Error Handling

Email sending errors are:

1. Caught and logged, but don't interrupt critical flows
2. Retried for critical emails when possible
3. Reported to admins for systemic issues

## Future Enhancements

Potential improvements to the email system:

1. **Queue System**: Add a message queue for reliable email delivery
2. **Template Management**: Admin UI for managing email templates
3. **Tenant Branding**: Allow tenants to customize email templates
4. **Email Analytics**: Track open and click rates
5. **Attachments Support**: Add support for email attachments
6. **HTML to Text Conversion**: Improve plain text alternative generation
7. **Localization**: Add multi-language support for email templates