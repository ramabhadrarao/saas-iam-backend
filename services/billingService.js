// File: services/billingService.js
const mongoose = require('mongoose');
const Tenant = require('../models/tenant.model');
const Subscription = require('../models/subscription.model');
const Invoice = require('../models/invoice.model');
const UsageRecord = require('../models/usageRecord.model');
const BillingPlan = require('../models/billingPlan.model');
const DbConnectionManager = require('./dbConnectionManager');
const invoiceGenerator = require('./invoiceGenerator');
const emailService = require('./emailService');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

/**
 * Service for billing and subscription management
 */
class BillingService {
  /**
   * Get count of active users for a tenant
   * @param {string} tenantId - Tenant ID
   * @returns {Promise<number>} Count of active users
   */
  static async getActiveTenantUserCount(tenantId) {
    try {
      // Connect to tenant database
      const tenantConnection = await DbConnectionManager.getTenantConnection(tenantId);
      const TenantUser = tenantConnection.model('User');
      
      // Count active users
      return await TenantUser.countDocuments({ isActive: true });
    } catch (error) {
      console.error(`Error getting active user count for tenant ${tenantId}:`, error);
      return 0;
    }
  }

  /**
   * Get tenant storage usage in bytes
   * @param {string} tenantId - Tenant ID
   * @returns {Promise<number>} Storage usage in bytes
   */
  static async getTenantStorageUsage(tenantId) {
    try {
      // This is a placeholder. In a real implementation, this would calculate
      // actual storage usage from file storage, database size, etc.
      
      // For demo purposes, just return a random number between 1MB and 1GB
      return Math.floor(Math.random() * (1024 * 1024 * 1024 - 1024 * 1024) + 1024 * 1024);
    } catch (error) {
      console.error(`Error getting storage usage for tenant ${tenantId}:`, error);
      return 0;
    }
  }

  /**
   * Validate a coupon code and return discount amount
   * @param {string} couponCode - Coupon code
   * @param {number} basePrice - Base price
   * @returns {Promise<number>} Discount amount
   */
  static async validateCoupon(couponCode, basePrice) {
    // This is a simplified example. In a real implementation, you would
    // check a coupon database, validate expiration dates, usage limits, etc.
    
    // For demo purposes, handle a few test coupons
    switch (couponCode.toUpperCase()) {
      case 'WELCOME10':
        return basePrice * 0.1; // 10% discount
      case 'WELCOME20':
        return basePrice * 0.2; // 20% discount
      case 'FIRST50':
        return Math.min(basePrice * 0.5, 50); // 50% discount up to $50
      default:
        return 0; // Invalid coupon
    }
  }

  /**
   * Process subscription renewal
   * @param {Object} subscription - Subscription document
   * @returns {Promise<boolean>} Success status
   */
  static async processSubscriptionRenewal(subscription) {
    try {
      console.log(`Processing renewal for subscription ${subscription._id} (Tenant: ${subscription.tenantId})`);
      
      // Get tenant
      const tenant = await Tenant.findById(subscription.tenantId);
      if (!tenant) {
        console.error(`Tenant ${subscription.tenantId} not found`);
        return false;
      }
      
      // Skip if subscription is not active or auto-renew is disabled
      if (subscription.status !== 'active' || !subscription.autoRenew) {
        console.log(`Skipping renewal: subscription status=${subscription.status}, autoRenew=${subscription.autoRenew}`);
        return false;
      }
      
      // Get billing plan
      const billingPlan = await BillingPlan.findOne({ planId: subscription.plan });
      if (!billingPlan) {
        console.error(`Billing plan ${subscription.plan} not found`);
        return false;
      }
      
      // Calculate new dates
      const newStartDate = new Date(subscription.endDate);
      let newEndDate = new Date(newStartDate);
      
      // Determine billing term from pricing tier
      const pricingTier = billingPlan.pricingTiers.find(tier => tier.cycle === subscription.billingCycle);
      if (!pricingTier) {
        console.error(`Pricing tier for ${subscription.billingCycle} not found`);
        return false;
      }
      
      newEndDate.setDate(newStartDate.getDate() + pricingTier.billingTerm);
      
      // Create renewed subscription
      const renewedSubscription = new Subscription({
        tenantId: subscription.tenantId,
        plan: subscription.plan,
        billingCycle: subscription.billingCycle,
        basePrice: subscription.basePrice,
        discount: subscription.discount,
        currency: subscription.currency,
        startDate: newStartDate,
        endDate: newEndDate,
        status: 'active',
        stripeCustomerId: subscription.stripeCustomerId,
        stripeSubscriptionId: subscription.stripeSubscriptionId,
        paymentMethod: subscription.paymentMethod,
        autoRenew: subscription.autoRenew
      });
      
      await renewedSubscription.save();
      
      // If using Stripe subscription, let Stripe handle the renewal
      if (subscription.stripeSubscriptionId) {
        console.log(`Stripe will handle renewal for subscription ${subscription.stripeSubscriptionId}`);
        
        // Update the subscription record with the new Stripe subscription details
        const stripeSubscription = await stripe.subscriptions.retrieve(subscription.stripeSubscriptionId);
        
        renewedSubscription.stripeSubscriptionId = stripeSubscription.id;
        await renewedSubscription.save();
      } 
      // Otherwise, generate a renewal invoice
      else {
        console.log(`Generating renewal invoice for subscription ${renewedSubscription._id}`);
        await invoiceGenerator.generateSubscriptionInvoice(renewedSubscription, tenant);
      }
      
      // Create new usage record for the renewal period
      const usageRecord = new UsageRecord({
        tenantId: subscription.tenantId,
        subscriptionId: renewedSubscription._id,
        startDate: newStartDate,
        endDate: newEndDate,
        metrics: {
          activeUsers: {
            count: await this.getActiveTenantUserCount(subscription.tenantId),
            limit: billingPlan.limits.users,
            overageCount: 0
          },
          storage: {
            usedBytes: await this.getTenantStorageUsage(subscription.tenantId),
            limitBytes: billingPlan.limits.storage * 1024 * 1024 * 1024, // Convert GB to bytes
            overageBytes: 0
          },
          apiCalls: {
            count: 0,
            limit: billingPlan.limits.apiCalls,
            overageCount: 0
          }
        }
      });
      
      await usageRecord.save();
      
      // Update the previous subscription as inactive
      subscription.status = 'inactive';
      await subscription.save();
      
      // Send renewal notification
      await emailService.sendSubscriptionRenewalNotification(tenant, renewedSubscription);
      
      console.log(`Successfully renewed subscription ${subscription._id} -> ${renewedSubscription._id}`);
      return true;
    } catch (error) {
      console.error(`Error renewing subscription ${subscription._id}:`, error);
      return false;
    }
  }

  /**
   * Update subscription status based on payment status
   * @param {Object} subscription - Subscription document
   * @param {Object} event - Payment event
   * @returns {Promise<void>}
   */
  static async updateSubscriptionFromPayment(subscription, event) {
    try {
      // This method would handle subscription status updates based on
      // payment success or failure events from Stripe webhooks
      
      const eventType = event.type;
      const invoiceObject = event.data.object;
      
      switch (eventType) {
        case 'invoice.paid':
          // Update subscription to active if it was past_due
          if (subscription.status === 'past_due') {
            subscription.status = 'active';
            await subscription.save();
            
            // Update related invoice in our system
            const invoice = await Invoice.findOne({ stripeInvoiceId: invoiceObject.id });
            if (invoice) {
              invoice.status = 'paid';
              invoice.paidDate = new Date();
              await invoice.save();
            }
          }
          break;
          
        case 'invoice.payment_failed':
          // Mark subscription as past_due
          if (subscription.status === 'active') {
            subscription.status = 'past_due';
            await subscription.save();
            
            // Send payment failed notification
            const tenant = await Tenant.findById(subscription.tenantId);
            if (tenant) {
              await emailService.sendPaymentFailedNotification(tenant, subscription);
            }
          }
          break;
          
        case 'customer.subscription.deleted':
          // Mark subscription as canceled
          subscription.status = 'canceled';
          subscription.canceledAt = new Date();
          await subscription.save();
          
          // Update tenant to free plan
          const tenant = await Tenant.findById(subscription.tenantId);
          if (tenant) {
            tenant.plan = 'free';
            await tenant.save();
            
            // Send cancellation notification
            await emailService.sendSubscriptionCancellationNotification(
              tenant, 
              subscription, 
              true,
              'Subscription canceled due to payment issues'
            );
          }
          break;
      }
    } catch (error) {
      console.error(`Error updating subscription from payment:`, error);
    }
  }

  /**
   * Calculate usage overages for a tenant
   * @param {string} tenantId - Tenant ID
   * @returns {Promise<Object>} Overage metrics
   */
  static async calculateUsageOverages(tenantId) {
    try {
      // Find active subscription
      const subscription = await Subscription.findOne({
        tenantId,
        status: { $in: ['active', 'trialing'] }
      });
      
      if (!subscription) {
        return null;
      }
      
      // Find current usage record
      const usageRecord = await UsageRecord.findOne({
        tenantId,
        subscriptionId: subscription._id,
        startDate: { $lte: new Date() },
        endDate: { $gte: new Date() }
      });
      
      if (!usageRecord) {
        return null;
      }
      
      // Get billing plan
      const billingPlan = await BillingPlan.findOne({ planId: subscription.plan });
      if (!billingPlan) {
        return null;
      }
      
      // Get current usage metrics
      const currentUserCount = await this.getActiveTenantUserCount(tenantId);
      const currentStorageBytes = await this.getTenantStorageUsage(tenantId);
      
      // Calculate overages
      const userOverage = Math.max(0, currentUserCount - billingPlan.limits.users);
      const storageOverageBytes = Math.max(0, currentStorageBytes - (billingPlan.limits.storage * 1024 * 1024 * 1024));
      
      // Update usage record
      usageRecord.metrics.activeUsers.count = currentUserCount;
      usageRecord.metrics.activeUsers.overageCount = userOverage;
      
      usageRecord.metrics.storage.usedBytes = currentStorageBytes;
      usageRecord.metrics.storage.overageBytes = storageOverageBytes;
      
      await usageRecord.save();
      
      // Return overage metrics
      return {
        users: {
          current: currentUserCount,
          limit: billingPlan.limits.users,
          overage: userOverage
        },
       // File: services/billingService.js (continued)
        storage: {
          current: currentStorageBytes,
          limit: billingPlan.limits.storage * 1024 * 1024 * 1024,
          overage: storageOverageBytes
        },
        apiCalls: {
          current: usageRecord.metrics.apiCalls.count,
          limit: billingPlan.limits.apiCalls,
          overage: usageRecord.metrics.apiCalls.overageCount
        },
        hasOverages: userOverage > 0 || storageOverageBytes > 0 || usageRecord.metrics.apiCalls.overageCount > 0
      };
    } catch (error) {
      console.error(`Error calculating usage overages for tenant ${tenantId}:`, error);
      return null;
    }
  }

  /**
   * Track API call usage
   * @param {string} tenantId - Tenant ID
   * @param {string} endpoint - API endpoint
   * @returns {Promise<void>}
   */
  static async trackApiCall(tenantId, endpoint) {
    try {
      // Find active subscription
      const subscription = await Subscription.findOne({
        tenantId,
        status: { $in: ['active', 'trialing'] }
      });
      
      if (!subscription) {
        return;
      }
      
      // Find current usage record
      const usageRecord = await UsageRecord.findOne({
        tenantId,
        subscriptionId: subscription._id,
        startDate: { $lte: new Date() },
        endDate: { $gte: new Date() }
      });
      
      if (!usageRecord) {
        return;
      }
      
      // Get billing plan
      const billingPlan = await BillingPlan.findOne({ planId: subscription.plan });
      if (!billingPlan) {
        return;
      }
      
      // Increment API call count
      usageRecord.metrics.apiCalls.count += 1;
      
      // Check for overage
      if (usageRecord.metrics.apiCalls.count > billingPlan.limits.apiCalls) {
        usageRecord.metrics.apiCalls.overageCount = usageRecord.metrics.apiCalls.count - billingPlan.limits.apiCalls;
      }
      
      await usageRecord.save();
    } catch (error) {
      console.error(`Error tracking API call for tenant ${tenantId}:`, error);
    }
  }

  /**
   * Generate usage-based billing
   * @param {string} tenantId - Tenant ID
   * @returns {Promise<boolean>} Success status
   */
  static async generateUsageBilling(tenantId) {
    try {
      // Find active subscription
      const subscription = await Subscription.findOne({
        tenantId,
        status: { $in: ['active', 'trialing'] }
      });
      
      if (!subscription) {
        return false;
      }
      
      // Get tenant
      const tenant = await Tenant.findById(tenantId);
      if (!tenant) {
        return false;
      }
      
      // Find usage records pending billing
      const usageRecords = await UsageRecord.find({
        tenantId,
        billingStatus: 'pending',
        subscriptionId: subscription._id
      });
      
      if (usageRecords.length === 0) {
        return false;
      }
      
      // Get billing plan
      const billingPlan = await BillingPlan.findOne({ planId: subscription.plan });
      if (!billingPlan) {
        return false;
      }
      
      // Check for overages
      let hasOverages = false;
      const overageItems = [];
      
      for (const record of usageRecords) {
        // User overages
        if (record.metrics.activeUsers.overageCount > 0) {
          hasOverages = true;
          
          // Calculate user overage cost (e.g., $10 per user)
          const userOverageCost = record.metrics.activeUsers.overageCount * 10;
          
          overageItems.push({
            description: `Additional User Licenses (${record.metrics.activeUsers.overageCount})`,
            quantity: record.metrics.activeUsers.overageCount,
            unitPrice: 10,
            amount: userOverageCost,
            type: 'usage',
            periodStart: record.startDate,
            periodEnd: record.endDate,
            details: {
              metric: 'users',
              included: billingPlan.limits.users,
              actual: record.metrics.activeUsers.count,
              overage: record.metrics.activeUsers.overageCount
            }
          });
        }
        
        // Storage overages
        if (record.metrics.storage.overageBytes > 0) {
          hasOverages = true;
          
          // Calculate storage overage cost (e.g., $0.10 per GB)
          const storageOverageGB = Math.ceil(record.metrics.storage.overageBytes / (1024 * 1024 * 1024));
          const storageOverageCost = storageOverageGB * 0.1;
          
          overageItems.push({
            description: `Additional Storage (${storageOverageGB} GB)`,
            quantity: storageOverageGB,
            unitPrice: 0.1,
            amount: storageOverageCost,
            type: 'usage',
            periodStart: record.startDate,
            periodEnd: record.endDate,
            details: {
              metric: 'storage',
              included: `${billingPlan.limits.storage} GB`,
              actual: `${Math.ceil(record.metrics.storage.usedBytes / (1024 * 1024 * 1024))} GB`,
              overage: `${storageOverageGB} GB`
            }
          });
        }
        
        // API call overages
        if (record.metrics.apiCalls.overageCount > 0) {
          hasOverages = true;
          
          // Calculate API call overage cost (e.g., $0.001 per call)
          const apiCallOverageCost = record.metrics.apiCalls.overageCount * 0.001;
          
          overageItems.push({
            description: `Additional API Calls (${record.metrics.apiCalls.overageCount})`,
            quantity: record.metrics.apiCalls.overageCount,
            unitPrice: 0.001,
            amount: apiCallOverageCost,
            type: 'usage',
            periodStart: record.startDate,
            periodEnd: record.endDate,
            details: {
              metric: 'apiCalls',
              included: billingPlan.limits.apiCalls,
              actual: record.metrics.apiCalls.count,
              overage: record.metrics.apiCalls.overageCount
            }
          });
        }
        
        // Mark usage record as billed
        record.billingStatus = 'billed';
        await record.save();
      }
      
      // If overages found, generate invoice
      if (hasOverages) {
        // Generate invoice number
        const invoiceNumber = await invoiceGenerator.generateInvoiceNumber();
        
        // Calculate totals
        const subtotal = overageItems.reduce((sum, item) => sum + item.amount, 0);
        
        // Create invoice
        const invoice = new Invoice({
          invoiceNumber,
          tenantId,
          subscriptionId: subscription._id,
          items: overageItems,
          subtotal,
          total: subtotal, // No tax or discounts for usage billing in this example
          currency: subscription.currency,
          issueDate: new Date(),
          dueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), // Due in 15 days
          status: 'issued',
          billingAddress: tenant.address || {}
        });
        
        await invoice.save();
        
        // Send usage invoice notification
        await emailService.sendUsageInvoiceNotification(tenant, invoice, overageItems);
        
        return true;
      }
      
      return false;
    } catch (error) {
      console.error(`Error generating usage billing for tenant ${tenantId}:`, error);
      return false;
    }
  }

  /**
   * Handle subscription expiration
   * @param {Object} subscription - Subscription document
   * @returns {Promise<void>}
   */
  static async handleSubscriptionExpiration(subscription) {
    try {
      // Update subscription status
      subscription.status = 'expired';
      await subscription.save();
      
      // Get tenant
      const tenant = await Tenant.findById(subscription.tenantId);
      if (!tenant) {
        return;
      }
      
      // Check if there's a newer active subscription
      const activeSubscription = await Subscription.findOne({
        tenantId: subscription.tenantId,
        status: { $in: ['active', 'trialing'] },
        _id: { $ne: subscription._id }
      });
      
      // If no active subscription, downgrade tenant to free plan
      if (!activeSubscription) {
        tenant.plan = 'free';
        await tenant.save();
        
        // Send expiration notification
        await emailService.sendSubscriptionExpirationNotification(tenant, subscription);
      }
    } catch (error) {
      console.error(`Error handling subscription expiration:`, error);
    }
  }

  /**
   * Run daily billing processes
   * @returns {Promise<void>}
   */
  static async runDailyBillingProcesses() {
    try {
      console.log('Running daily billing processes...');
      
      // Find subscriptions due for renewal
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      const subscriptionsDueForRenewal = await Subscription.find({
        status: 'active',
        autoRenew: true,
        endDate: {
          $gte: today,
          $lt: tomorrow
        }
      });
      
      console.log(`Found ${subscriptionsDueForRenewal.length} subscriptions due for renewal`);
      
      // Process renewals
      for (const subscription of subscriptionsDueForRenewal) {
        await this.processSubscriptionRenewal(subscription);
      }
      
      // Find expired subscriptions
      const expiredSubscriptions = await Subscription.find({
        status: { $in: ['active', 'past_due', 'trialing'] },
        endDate: { $lt: today }
      });
      
      console.log(`Found ${expiredSubscriptions.length} expired subscriptions`);
      
      // Handle expirations
      for (const subscription of expiredSubscriptions) {
        await this.handleSubscriptionExpiration(subscription);
      }
      
      // Generate monthly usage billing for all tenants
      // Note: In a production system, you would want to batch this process
      // or run it as a background job for each tenant
      const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      if (today.getDate() === 1) {
        const tenants = await Tenant.find({ isActive: true });
        
        console.log(`Generating monthly usage billing for ${tenants.length} tenants`);
        
        for (const tenant of tenants) {
          await this.generateUsageBilling(tenant._id);
        }
      }
      
      console.log('Daily billing processes completed');
    } catch (error) {
      console.error('Error running daily billing processes:', error);
    }
  }
}

module.exports = BillingService;