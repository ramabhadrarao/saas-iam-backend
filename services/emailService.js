// File: backend/services/emailService.js
const nodemailer = require('nodemailer');
const fs = require('fs').promises;
const path = require('path');
const handlebars = require('handlebars');

/**
 * Email Service
 * 
 * Provides methods to send emails using nodemailer with template support
 */
class EmailService {
  constructor() {
    this.transporter = null;
    this.initialized = false;
    this.templateCache = {};
  }

  /**
   * Initialize the email service
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.initialized) return;

    try {
      // Create a nodemailer transporter with the environment settings
      this.transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: parseInt(process.env.EMAIL_PORT, 10),
        secure: process.env.EMAIL_SECURE === 'true',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASSWORD
        }
      });

      // Verify connection
      await this.transporter.verify();
      
      console.log('Email service initialized successfully');
      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize email service:', error);
      throw error;
    }
  }

  /**
   * Get email template
   * @param {string} templateName - Template name (without .html extension)
   * @returns {Promise<Function>} - Compiled handlebars template
   */
  async getTemplate(templateName) {
    // Check if template is in cache
    if (this.templateCache[templateName]) {
      return this.templateCache[templateName];
    }

    try {
      // Read template file
      const templatePath = path.join(__dirname, '../templates/emails', `${templateName}.html`);
      const templateContent = await fs.readFile(templatePath, 'utf8');
      
      // Compile template
      const template = handlebars.compile(templateContent);
      
      // Cache template
      this.templateCache[templateName] = template;
      
      return template;
    } catch (error) {
      console.error(`Failed to load email template '${templateName}':`, error);
      throw error;
    }
  }

  /**
   * Send an email
   * @param {Object} options - Email options
   * @param {string} options.to - Recipient email address
   * @param {string} options.subject - Email subject
   * @param {string} options.text - Plain text content (optional)
   * @param {string} options.html - HTML content (optional)
   * @param {string} options.from - Sender email address (optional)
   * @param {string} options.replyTo - Reply-to email address (optional)
   * @param {Array<Object>} options.attachments - Email attachments (optional)
   * @returns {Promise<Object>} - Nodemailer send mail result
   */
  async sendMail(options) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const mailOptions = {
        from: options.from || `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_FROM}>`,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html
      };

      // Add optional parameters if provided
      if (options.replyTo) {
        mailOptions.replyTo = options.replyTo;
      }

      if (options.attachments && options.attachments.length > 0) {
        mailOptions.attachments = options.attachments;
      }

      // Send email
      const result = await this.transporter.sendMail(mailOptions);
      
      console.log(`Email sent to ${options.to}, Message ID: ${result.messageId}`);
      return result;
    } catch (error) {
      console.error('Failed to send email:', error);
      throw error;
    }
  }

  /**
   * Send an email using a template
   * @param {Object} options - Email options
   * @param {string} options.to - Recipient email address
   * @param {string} options.subject - Email subject
   * @param {string} options.templateName - Template name
   * @param {Object} options.templateData - Data to pass to the template
   * @param {string} options.from - Sender email address (optional)
   * @param {string} options.replyTo - Reply-to email address (optional)
   * @param {Array<Object>} options.attachments - Email attachments (optional)
   * @returns {Promise<Object>} - Nodemailer send mail result
   */
  async sendTemplateEmail(options) {
    if (!options.templateName) {
      throw new Error('Template name is required');
    }

    try {
      // Get and render the template
      const template = await this.getTemplate(options.templateName);
      const html = template(options.templateData || {});

      // Create a text-only version
      const text = options.text || this.htmlToText(html);

      // Send the email with the rendered template
      return await this.sendMail({
        ...options,
        html,
        text
      });
    } catch (error) {
      console.error(`Failed to send template email '${options.templateName}':`, error);
      throw error;
    }
  }

  /**
   * Very simple HTML to text converter for fallback content
   * @param {string} html - HTML content
   * @returns {string} - Plain text content
   */
  htmlToText(html) {
    // This is a very simplistic approach, consider using a proper html-to-text library for production
    return html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  /**
   * Send a welcome email to a new tenant admin
   * @param {Object} tenant - Tenant object
   * @param {Object} user - User object 
   * @param {string} password - Initial password (only for newly created users)
   * @returns {Promise<Object>} - Email send result
   */
  async sendTenantWelcomeEmail(tenant, user, password) {
    return this.sendTemplateEmail({
      to: user.email,
      subject: `Welcome to ${process.env.EMAIL_FROM_NAME} - Your Tenant Account is Ready`,
      templateName: 'tenant-welcome',
      templateData: {
        firstName: user.firstName,
        tenantName: tenant.name,
        tenantSubdomain: tenant.subdomain,
        loginUrl: `https://${tenant.subdomain}.${process.env.APP_DOMAIN || 'example.com'}/login`,
        email: user.email,
        password: password || 'Your chosen password',
        showPassword: !!password,
        supportEmail: process.env.EMAIL_FROM,
        year: new Date().getFullYear()
      }
    });
  }

  /**
   * Send a password reset email
   * @param {Object} user - User object
   * @param {string} resetToken - Password reset token
   * @param {Object} tenant - Tenant object (optional, for tenant users)
   * @returns {Promise<Object>} - Email send result
   */
  async sendPasswordResetEmail(user, resetToken, tenant = null) {
    // Determine base URL based on tenant
    let resetUrl;
    if (tenant) {
      resetUrl = `https://${tenant.subdomain}.${process.env.APP_DOMAIN || 'example.com'}/reset-password/${resetToken}`;
    } else {
      resetUrl = `https://${process.env.APP_DOMAIN || 'example.com'}/reset-password/${resetToken}`;
    }

    return this.sendTemplateEmail({
      to: user.email,
      subject: 'Password Reset Request',
      templateName: 'password-reset',
      templateData: {
        firstName: user.firstName,
        resetUrl,
        expiryTime: '30 minutes',
        year: new Date().getFullYear()
      }
    });
  }

  /**
   * Send a tenant suspension notification
   * @param {Object} tenant - Tenant object
   * @param {Object} user - Admin user object
   * @param {string} reason - Suspension reason
   * @returns {Promise<Object>} - Email send result
   */
  async sendTenantSuspensionEmail(tenant, user, reason) {
    return this.sendTemplateEmail({
      to: user.email,
      subject: 'Important: Your Tenant Account Has Been Suspended',
      templateName: 'tenant-suspension',
      templateData: {
        firstName: user.firstName,
        tenantName: tenant.name,
        reason: reason || 'Administrative decision',
        supportEmail: process.env.EMAIL_FROM,
        year: new Date().getFullYear()
      }
    });
  }

  /**
   * Send a new user invitation email
   * @param {Object} user - User object
   * @param {string} inviteToken - Invite token
   * @param {Object} tenant - Tenant object (for tenant users)
   * @param {Object} inviter - User who sent the invitation
   * @returns {Promise<Object>} - Email send result
   */
  async sendUserInvitationEmail(user, inviteToken, tenant, inviter) {
    // Determine base URL based on tenant
    let inviteUrl;
    if (tenant) {
      inviteUrl = `https://${tenant.subdomain}.${process.env.APP_DOMAIN || 'example.com'}/accept-invite/${inviteToken}`;
    } else {
      inviteUrl = `https://${process.env.APP_DOMAIN || 'example.com'}/accept-invite/${inviteToken}`;
    }

    return this.sendTemplateEmail({
      to: user.email,
      subject: `Invitation to join ${tenant ? tenant.name : process.env.EMAIL_FROM_NAME}`,
      templateName: 'user-invitation',
      templateData: {
        email: user.email,
        firstName: user.firstName,
        inviterName: `${inviter.firstName} ${inviter.lastName}`,
        tenantName: tenant ? tenant.name : process.env.EMAIL_FROM_NAME,
        inviteUrl,
        expiryTime: '7 days',
        year: new Date().getFullYear()
      }
    });
  }

/**
 * Send a ticket notification
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email address
 * @param {string} options.subject - Email subject
 * @param {string} options.templateName - Template name
 * @param {Object} options.templateData - Data to pass to the template
 */
  async sendTicketNotification(options) {
    return this.sendTemplateEmail({
      ...options,
      templateData: {
        ...options.templateData,
        year: new Date().getFullYear()
      }
    });
  }



}



// Create and export a singleton instance
const emailService = new EmailService();
module.exports = emailService;