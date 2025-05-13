// File: controllers/billing.controller.js
const Subscription = require('../models/subscription.model');
const Invoice = require('../models/invoice.model');
const Payment = require('../models/payment.model');
const BillingPlan = require('../models/billingPlan.model');
const UsageRecord = require('../models/usageRecord.model');
const Tenant = require('../models/tenant.model');
const User = require('../models/user.model');
const { createAuditLog } = require('../utils/auditLogger');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const billingService = require('../services/billingService');
const invoiceGenerator = require('../services/invoiceGenerator');
const emailService = require('../services/emailService');
const mongoose = require('mongoose');
const { AppError } = require('../middleware/errorHandler');

// Get available billing plans
exports.getBillingPlans = async (req, res) => {
  try {
    const plans = await BillingPlan.find({ isActive: true }).sort({ displayOrder: 1 });
    
    res.status(200).json({ plans });
  } catch (error) {
    console.error('Get billing plans error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Get tenant subscription information
exports.getTenantSubscription = async (req, res) => {
  try {
    const tenantId = req.params.tenantId || req.user.tenantId;
    
    // Check authorization
    if (req.user.userType !== 'master_admin' && req.user.tenantId.toString() !== tenantId) {
      return res.status(403).json({ message: 'Not authorized to access this tenant subscription' });
    }
    
    // Get tenant
    const tenant = await Tenant.findById(tenantId);
    if (!tenant) {
      return res.status(404).json({ message: 'Tenant not found' });
    }
    
    // Get active subscription
    const subscription = await Subscription.findOne({ 
      tenantId, 
      status: { $in: ['active', 'trialing', 'past_due'] } 
    }).sort({ startDate: -1 });
    
    // Get billing plan information
    let planInfo = null;
    if (subscription) {
      planInfo = await BillingPlan.findOne({ planId: subscription.plan });
    }
    
    // Get recent invoices
    const invoices = await Invoice.find({ tenantId })
      .sort({ issueDate: -1 })
      .limit(5);
    
    // Get recent payments
    const payments = await Payment.find({ tenantId })
      .sort({ paymentDate: -1 })
      .limit(5);
    
    // Get usage records for current billing cycle
    let usageRecord = null;
    if (subscription) {
      usageRecord = await UsageRecord.findOne({
        tenantId,
        subscriptionId: subscription._id,
        startDate: { $lte: new Date() },
        endDate: { $gte: new Date() }
      });
    }
    // File: controllers/billing.controller.js (continued)
    
    // Format response
    const subscriptionData = subscription ? {
      id: subscription._id,
      plan: subscription.plan,
      status: subscription.status,
      billingCycle: subscription.billingCycle,
      startDate: subscription.startDate,
      endDate: subscription.endDate,
      autoRenew: subscription.autoRenew,
      trialEndDate: subscription.trialEndDate,
      isTrialing: subscription.isTrialing(),
      daysTillExpiration: subscription.daysTillExpiration(),
      planDetails: planInfo ? {
        name: planInfo.name,
        description: planInfo.description,
        limits: planInfo.limits,
        features: planInfo.features
      } : null
    } : null;
    
    res.status(200).json({
      tenant: {
        id: tenant._id,
        name: tenant.name,
        plan: tenant.plan
      },
      subscription: subscriptionData,
      billing: {
        recentInvoices: invoices.map(invoice => ({
          id: invoice._id,
          invoiceNumber: invoice.invoiceNumber,
          issueDate: invoice.issueDate,
          dueDate: invoice.dueDate,
          status: invoice.status,
          total: invoice.total,
          currency: invoice.currency
        })),
        recentPayments: payments.map(payment => ({
          id: payment._id,
          amount: payment.amount,
          status: payment.status,
          paymentDate: payment.paymentDate,
          paymentMethod: payment.paymentMethod
        }))
      },
      usage: usageRecord ? {
        period: {
          start: usageRecord.startDate,
          end: usageRecord.endDate
        },
        metrics: usageRecord.metrics,
        hasOverages: usageRecord.hasOverages
      } : null
    });
    
  } catch (error) {
    console.error('Get tenant subscription error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Create a new subscription for a tenant
exports.createSubscription = async (req, res) => {
  try {
    const { tenantId, plan, billingCycle, paymentMethodId, couponCode } = req.body;
    
    // Check authorization - only master admins or tenant admins for their own tenant
    if (req.user.userType !== 'master_admin' && 
        (!req.user.tenantId || req.user.tenantId.toString() !== tenantId)) {
      return res.status(403).json({ message: 'Not authorized to create subscription for this tenant' });
    }
    
    // Get tenant
    const tenant = await Tenant.findById(tenantId);
    if (!tenant) {
      return res.status(404).json({ message: 'Tenant not found' });
    }
    
    // Get billing plan
    const billingPlan = await BillingPlan.findOne({ planId: plan, isActive: true });
    if (!billingPlan) {
      return res.status(404).json({ message: 'Billing plan not found or inactive' });
    }
    
    // Check if there's an active subscription
    const activeSubscription = await Subscription.findOne({
      tenantId,
      status: { $in: ['active', 'trialing'] }
    });
    
    if (activeSubscription) {
      return res.status(400).json({ message: 'Tenant already has an active subscription' });
    }
    
    // Get pricing tier based on billing cycle
    const pricingTier = billingPlan.pricingTiers.find(tier => tier.cycle === billingCycle);
    if (!pricingTier) {
      return res.status(400).json({ message: `Selected billing cycle ${billingCycle} is not available for this plan` });
    }
    
    // Apply coupon if provided
    let discount = 0;
    if (couponCode) {
      // Here you would validate the coupon code and calculate the discount
      // This is a simplified example
      const couponDiscount = await billingService.validateCoupon(couponCode, pricingTier.price);
      if (couponDiscount > 0) {
        discount = couponDiscount;
      }
    }
    
    // Set up dates
    const startDate = new Date();
    let endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + pricingTier.billingTerm);
    
    let trialEndDate = null;
    if (pricingTier.trialDays > 0) {
      trialEndDate = new Date(startDate);
      trialEndDate.setDate(trialEndDate.getDate() + pricingTier.trialDays);
    }
    
    // Create Stripe customer if payment method provided
    let stripeCustomerId = null;
    let stripeSubscriptionId = null;
    let paymentMethod = 'none';
    
    if (paymentMethodId) {
      try {
        // Create or retrieve Stripe customer
        const customerEmail = tenant.contactEmail;
        const customerName = tenant.name;
        
        // Check if this tenant already has a Stripe customer ID
        if (tenant.stripeCustomerId) {
          stripeCustomerId = tenant.stripeCustomerId;
          
          // Attach the payment method to the customer
          await stripe.paymentMethods.attach(paymentMethodId, {
            customer: stripeCustomerId
          });
          
          // Set as default payment method
          await stripe.customers.update(stripeCustomerId, {
            invoice_settings: {
              default_payment_method: paymentMethodId
            }
          });
        } else {
          // Create a new customer
          const customer = await stripe.customers.create({
            email: customerEmail,
            name: customerName,
            payment_method: paymentMethodId,
            invoice_settings: {
              default_payment_method: paymentMethodId
            }
          });
          
          stripeCustomerId = customer.id;
          
          // Update tenant with Stripe customer ID
          tenant.stripeCustomerId = stripeCustomerId;
          await tenant.save();
        }
        
        // Get payment method details for record-keeping
        const paymentMethodDetails = await stripe.paymentMethods.retrieve(paymentMethodId);
        paymentMethod = paymentMethodDetails.type === 'card' ? 'credit_card' : paymentMethodDetails.type;
        
        // If using Stripe for subscription management, create subscription
        if (pricingTier.stripePriceId) {
          const stripeSubscription = await stripe.subscriptions.create({
            customer: stripeCustomerId,
            items: [{ price: pricingTier.stripePriceId }],
            trial_end: trialEndDate ? Math.floor(trialEndDate.getTime() / 1000) : 'now',
            payment_behavior: 'default_incomplete',
            expand: ['latest_invoice.payment_intent']
          });
          
          stripeSubscriptionId = stripeSubscription.id;
        }
      } catch (stripeError) {
        console.error('Stripe subscription error:', stripeError);
        return res.status(400).json({ 
          message: 'Payment processing error', 
          details: stripeError.message 
        });
      }
    }
    
    // Create subscription record
    const subscription = new Subscription({
      tenantId,
      plan,
      billingCycle,
      basePrice: pricingTier.price,
      discount,
      currency: pricingTier.currency,
      startDate,
      endDate,
      trialEndDate,
      status: trialEndDate ? 'trialing' : 'active',
      stripeCustomerId,
      stripeSubscriptionId,
      paymentMethod
    });
    
    await subscription.save();
    
    // Update tenant plan
    tenant.plan = plan;
    await tenant.save();
    
    // Create initial usage record
    const usageRecord = new UsageRecord({
      tenantId,
      subscriptionId: subscription._id,
      startDate,
      endDate,
      metrics: {
        activeUsers: {
          count: await billingService.getActiveTenantUserCount(tenantId),
          limit: billingPlan.limits.users,
          overageCount: 0
        },
        storage: {
          usedBytes: await billingService.getTenantStorageUsage(tenantId),
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
    
    // Generate invoice if immediate payment is required
    if (!trialEndDate && pricingTier.price > 0 && !stripeSubscriptionId) {
      await invoiceGenerator.generateSubscriptionInvoice(subscription, tenant);
    }
    
    // Log subscription creation
    await createAuditLog({
      userId: req.user.id,
      action: 'CREATE',
      module: 'SUBSCRIPTION',
      description: `Created ${plan} subscription for tenant ${tenant.name}`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      tenantId: req.user.tenantId || null
    });
    
    // Send confirmation email
    await emailService.sendSubscriptionConfirmation(tenant, subscription, billingPlan);
    
    res.status(201).json({
      message: 'Subscription created successfully',
      subscription: {
        id: subscription._id,
        plan: subscription.plan,
        billingCycle: subscription.billingCycle,
        startDate: subscription.startDate,
        endDate: subscription.endDate,
        status: subscription.status,
        trialEndDate: subscription.trialEndDate
      }
    });
    
  } catch (error) {
    console.error('Create subscription error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Update an existing subscription
exports.updateSubscription = async (req, res) => {
  try {
    const subscriptionId = req.params.id;
    const { plan, billingCycle, autoRenew } = req.body;
    
    // Find subscription
    const subscription = await Subscription.findById(subscriptionId);
    if (!subscription) {
      return res.status(404).json({ message: 'Subscription not found' });
    }
    
    // Check authorization
    if (req.user.userType !== 'master_admin' && 
        (!req.user.tenantId || req.user.tenantId.toString() !== subscription.tenantId.toString())) {
      return res.status(403).json({ message: 'Not authorized to update this subscription' });
    }
    
    // Get tenant
    const tenant = await Tenant.findById(subscription.tenantId);
    if (!tenant) {
      return res.status(404).json({ message: 'Tenant not found' });
    }
    
    // Handle changes to auto-renewal setting
    if (autoRenew !== undefined && autoRenew !== subscription.autoRenew) {
      subscription.autoRenew = autoRenew;
      
      // If using Stripe, update subscription
      if (subscription.stripeSubscriptionId) {
        try {
          await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
            cancel_at_period_end: !autoRenew
          });
        } catch (stripeError) {
          console.error('Stripe update subscription error:', stripeError);
          // Continue with local changes even if Stripe update fails
        }
      }
      
      // Log auto-renewal change
      await createAuditLog({
        userId: req.user.id,
        action: 'UPDATE',
        module: 'SUBSCRIPTION',
        description: `Changed auto-renewal to ${autoRenew ? 'enabled' : 'disabled'} for tenant ${tenant.name}`,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        tenantId: req.user.tenantId || null
      });
    }
    
    // Handle plan changes
    if (plan && plan !== subscription.plan) {
      // Verify the new plan exists
      const newBillingPlan = await BillingPlan.findOne({ planId: plan, isActive: true });
      if (!newBillingPlan) {
        return res.status(404).json({ message: 'New billing plan not found or inactive' });
      }
      
      // Check if current plan can upgrade to the new plan
      if (newBillingPlan.upgradeEligibility && 
          !newBillingPlan.upgradeEligibility.includes(subscription.plan)) {
        return res.status(400).json({ 
          message: 'Current plan is not eligible to upgrade to the selected plan' 
        });
      }
      
      // Get pricing tier for the new plan
      const newCycle = billingCycle || subscription.billingCycle;
      const newPricingTier = newBillingPlan.pricingTiers.find(tier => tier.cycle === newCycle);
      
      if (!newPricingTier) {
        return res.status(400).json({ 
          message: `Selected billing cycle ${newCycle} is not available for the new plan` 
        });
      }
      
      // Calculate proration amount if applicable
      const prorationAmount = subscription.calculateProration(newPricingTier.price);
      
      // Update subscription
      subscription.plan = plan;
      if (billingCycle) {
        subscription.billingCycle = billingCycle;
      }
      subscription.basePrice = newPricingTier.price;
      
      // If using Stripe, update subscription
      if (subscription.stripeSubscriptionId && newPricingTier.stripePriceId) {
        try {
          await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
            items: [{
              id: subscription.stripeSubscriptionId,
              price: newPricingTier.stripePriceId
            }],
            proration_behavior: 'create_prorations'
          });
        } catch (stripeError) {
          console.error('Stripe update subscription error:', stripeError);
          // Continue with local changes even if Stripe update fails
        }
      } 
      // If not using Stripe, handle proration manually
      else if (prorationAmount !== 0) {
        // Create adjustment invoice for proration
        await invoiceGenerator.generateProrationInvoice(
          subscription, 
          tenant, 
          prorationAmount, 
          `Plan change from ${subscription.plan} to ${plan}`
        );
      }
      
      // Update tenant plan
      tenant.plan = plan;
      await tenant.save();
      
      // Log plan change
      await createAuditLog({
        userId: req.user.id,
        action: 'UPDATE',
        module: 'SUBSCRIPTION',
        description: `Changed subscription plan from ${subscription.plan} to ${plan} for tenant ${tenant.name}`,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        tenantId: req.user.tenantId || null
      });
    }
    
    // Save changes
    await subscription.save();
    
    // Send notification email
    await emailService.sendSubscriptionUpdateNotification(tenant, subscription);
    
    res.status(200).json({
      message: 'Subscription updated successfully',
      subscription: {
        id: subscription._id,
        plan: subscription.plan,
        billingCycle: subscription.billingCycle,
        startDate: subscription.startDate,
        endDate: subscription.endDate,
        status: subscription.status,
        autoRenew: subscription.autoRenew
      }
    });
    
  } catch (error) {
    console.error('Update subscription error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Cancel a subscription
exports.cancelSubscription = async (req, res) => {
  try {
    const subscriptionId = req.params.id;
    const { cancelReason, cancelImmediately = false } = req.body;
    
    // Find subscription
    const subscription = await Subscription.findById(subscriptionId);
    if (!subscription) {
      return res.status(404).json({ message: 'Subscription not found' });
    }
    
    // Check authorization
    if (req.user.userType !== 'master_admin' && 
        (!req.user.tenantId || req.user.tenantId.toString() !== subscription.tenantId.toString())) {
      return res.status(403).json({ message: 'Not authorized to cancel this subscription' });
    }
    
    // Check if subscription is already canceled
    if (subscription.status === 'canceled') {
      return res.status(400).json({ message: 'Subscription is already canceled' });
    }
    
    // Get tenant
    const tenant = await Tenant.findById(subscription.tenantId);
    if (!tenant) {
      return res.status(404).json({ message: 'Tenant not found' });
    }
    
    // If canceling immediately, update status to canceled
    if (cancelImmediately) {
      subscription.status = 'canceled';
      subscription.canceledAt = new Date();
      
      // If using Stripe, cancel subscription
      if (subscription.stripeSubscriptionId) {
        try {
          await stripe.subscriptions.del(subscription.stripeSubscriptionId);
        } catch (stripeError) {
          console.error('Stripe cancel subscription error:', stripeError);
          // Continue with local changes even if Stripe update fails
        }
      }
    } 
    // Otherwise, set auto-renew to false (will cancel at end of period)
    else {
      subscription.autoRenew = false;
      
      // If using Stripe, update subscription
      if (subscription.stripeSubscriptionId) {
        try {
          await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
            cancel_at_period_end: true
          });
        } catch (stripeError) {
          console.error('Stripe update subscription error:', stripeError);
          // Continue with local changes even if Stripe update fails
        }
      }
    }
    
    // Save cancellation reason
    if (cancelReason) {
      if (!subscription.customPlan) {
        subscription.customPlan = {};
      }
      subscription.customPlan.notes = cancelReason;
    }
    
    // Save changes
    await subscription.save();
    
    // Downgrade tenant to free plan if canceled immediately
    if (cancelImmediately) {
      tenant.plan = 'free';
      await tenant.save();
    }
    
    // Log subscription cancellation
    await createAuditLog({
      userId: req.user.id,
      action: 'CANCEL',
      module: 'SUBSCRIPTION',
      description: `${cancelImmediately ? 'Immediately canceled' : 'Scheduled cancellation of'} subscription for tenant ${tenant.name}`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      tenantId: req.user.tenantId || null
    });
    
    // Send cancellation notification
    await emailService.sendSubscriptionCancellationNotification(
      tenant, 
      subscription, 
      cancelImmediately,
      cancelReason
    );
    
    res.status(200).json({
      message: cancelImmediately ? 
        'Subscription canceled successfully' : 
        'Subscription set to cancel at the end of the current billing period',
      subscription: {
        id: subscription._id,
        status: subscription.status,
        autoRenew: subscription.autoRenew,
        canceledAt: subscription.canceledAt,
        endDate: subscription.endDate
      }
    });
    
  } catch (error) {
    console.error('Cancel subscription error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Get invoices for a tenant
exports.getInvoices = async (req, res) => {
  try {
    const { tenantId, page = 1, limit = 10, status } = req.query;
    
    // Determine tenant ID based on user role
    let targetTenantId;
    
    if (req.user.userType === 'master_admin' && tenantId) {
      // Master admin can view any tenant's invoices
      targetTenantId = tenantId;
    } else if (req.user.tenantId) {
      // Tenant users can only view their tenant's invoices
      targetTenantId = req.user.tenantId;
    } else {
      return res.status(400).json({ message: 'Tenant ID is required' });
    }
    
    // Build query
    const query = { tenantId: targetTenantId };
    
    // Add status filter if provided
    if (status) {
      query.status = status;
    }
    
    // Pagination
    const skip = (page - 1) * limit;
    
    // Get invoices
    const invoices = await Invoice.find(query)
      .sort({ issueDate: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    // Get total count
    const total = await Invoice.countDocuments(query);
    
    res.status(200).json({
      invoices,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
    
  } catch (error) {
    console.error('Get invoices error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Get a specific invoice
exports.getInvoiceById = async (req, res) => {
  try {
    const invoiceId = req.params.id;
    
    const invoice = await Invoice.findById(invoiceId)
      .populate('tenantId', 'name contactEmail');
    
    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }
    
    // Check authorization
    if (req.user.userType !== 'master_admin' && 
        (!req.user.tenantId || req.user.tenantId.toString() !== invoice.tenantId._id.toString())) {
      return res.status(403).json({ message: 'Not authorized to view this invoice' });
    }
    
    res.status(200).json({ invoice });
    
  } catch (error) {
    console.error('Get invoice by ID error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Generate invoice PDF
exports.generateInvoicePdf = async (req, res) => {
  try {
    const invoiceId = req.params.id;
    
    const invoice = await Invoice.findById(invoiceId)
      .populate('tenantId', 'name contactEmail address');
    
    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }
    
    // Check authorization
    if (req.user.userType !== 'master_admin' && 
        (!req.user.tenantId || req.user.tenantId.toString() !== invoice.tenantId._id.toString())) {
      return res.status(403).json({ message: 'Not authorized to access this invoice' });
    }
    
    // Generate PDF
    const pdfBuffer = await invoiceGenerator.generateInvoicePdf(invoice);
    
    // Set headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="invoice-${invoice.invoiceNumber}.pdf"`);
    
    // Send PDF
    res.status(200).send(pdfBuffer);
    
  } catch (error) {
    console.error('Generate invoice PDF error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Process a payment
exports.processPayment = async (req, res) => {
  try {
    const { invoiceId, paymentMethodId, amount } = req.body;
    
    // Find invoice
    const invoice = await Invoice.findById(invoiceId);
    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }
    
    // Check authorization
    if (req.user.userType !== 'master_admin' && 
        (!req.user.tenantId || req.user.tenantId.toString() !== invoice.tenantId.toString())) {
      return res.status(403).json({ message: 'Not authorized to process payment for this invoice' });
    }
    
    // Check if invoice is already paid
    if (invoice.status === 'paid') {
      return res.status(400).json({ message: 'Invoice is already paid' });
    }
    
    // Get tenant
    const tenant = await Tenant.findById(invoice.tenantId);
    if (!tenant) {
      return res.status(404).json({ message: 'Tenant not found' });
    }
    
    // Process payment
    let paymentResult;
    
    // If using Stripe
    if (paymentMethodId) {
      try {
        // Create or get customer
        let customerId = tenant.stripeCustomerId;
        
        if (!customerId) {
          const customer = await stripe.customers.create({
            email: tenant.contactEmail,
            name: tenant.name
          });
          
          customerId = customer.id;
          tenant.stripeCustomerId = customerId;
          await tenant.save();
        }
        
        // Attach payment method to customer if not already
        await stripe.paymentMethods.attach(paymentMethodId, {
          customer: customerId
        });
        
        // Create payment intent
        const paymentIntent = await stripe.paymentIntents.create({
          amount: Math.round(invoice.total * 100), // Stripe uses cents
          currency: invoice.currency.toLowerCase(),
          customer: customerId,
          payment_method: paymentMethodId,
          confirm: true,
          description: `Invoice ${invoice.invoiceNumber}`,
          metadata: {
            invoiceId: invoice._id.toString(),
            tenantId: tenant._id.toString()
          }
        });
        
        // Check payment intent status
        if (paymentIntent.status === 'succeeded') {
          // Create payment record
          const payment = new Payment({
            tenantId: invoice.tenantId,
            invoiceId: invoice._id,
            amount: invoice.total,
            currency: invoice.currency,
            paymentMethod: 'credit_card',
            paymentMethodDetails: {
              cardBrand: paymentIntent.payment_method_details.card.brand,
              cardLast4: paymentIntent.payment_method_details.card.last4,
              cardExpMonth: paymentIntent.payment_method_details.card.exp_month,
              cardExpYear: paymentIntent.payment_method_details.card.exp_year
            },
            gateway: 'stripe',
            gatewayPaymentId: paymentIntent.id,
            gatewayResponse: paymentIntent,
            status: 'completed',
            paymentDate: new Date(),
            receiptUrl: paymentIntent.charges.data[0].receipt_url,
            processingFee: paymentIntent.charges.data[0].fee / 100 // Convert from cents
          });
          
          await payment.save();
          
          // Update invoice
          invoice.status = 'paid';
          invoice.paidDate = new Date();
          invoice.paymentIntentId = paymentIntent.id;
          invoice.paymentMethod = 'credit_card';
          await invoice.save();
          
          paymentResult = {
            success: true,
            paymentId: payment._id,
            receiptUrl: payment.receiptUrl
          };
        } else {
          throw new Error(`Payment failed with status: ${paymentIntent.status}`);
        }
      } catch (stripeError) {
        console.error('Stripe payment error:', stripeError);
        return res.status(400).json({
          message: 'Payment processing failed',
          details: stripeError.message
        });
      }
    } 
    // Manual payment processing
    else if (amount) {
      // Create payment record
      const payment = new Payment({
        tenantId: invoice.tenantId,
        invoiceId: invoice._id,
        amount: parseFloat(amount),
        currency: invoice.currency,
        paymentMethod: 'manual',
        gateway: 'manual',
        status: 'completed',
        paymentDate: new Date(),
        reference: `Manual payment by ${req.user.firstName} ${req.user.lastName}`
      });
      
      await payment.save();
      
      // Update invoice
      invoice.status = 'paid';
      invoice.paidDate = new Date();
      invoice.paymentMethod = 'manual';
      await invoice.save();
      
      paymentResult = {
        success: true,
        paymentId: payment._id
      };
    } else {
      return res.status(400).json({ message: 'Payment method or amount required' });
    }
    
    // Log payment
    await createAuditLog({
      userId: req.user.id,
      action: 'PAYMENT',
      module: 'BILLING',
      description: `Payment processed for invoice ${invoice.invoiceNumber}`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      tenantId: req.user.tenantId || null
    });
    
    // Send payment receipt
    await emailService.sendPaymentReceipt(tenant, invoice, paymentResult);
    
    res.status(200).json({
      message: 'Payment processed successfully',
      payment: paymentResult
    });
    
  } catch (error) {
    console.error('Process payment error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Get payment methods for a tenant
exports.getPaymentMethods = async (req, res) => {
  try {
    const tenantId = req.params.tenantId || req.user.tenantId;
    
    // Check authorization
    if (req.user.userType !== 'master_admin' && 
        (!req.user.tenantId || req.user.tenantId.toString() !== tenantId)) {
      return res.status(403).json({ message: 'Not authorized to access payment methods for this tenant' });
    }
    
    // Get tenant
    const tenant = await Tenant.findById(tenantId);
    if (!tenant) {
      return res.status(404).json({ message: 'Tenant not found' });
    }
    
    // If tenant has Stripe customer ID, get payment methods
    if (tenant.stripeCustomerId) {
      try {
        const paymentMethods = await stripe.paymentMethods.list({
          customer: tenant.stripeCustomerId,
          type: 'card'
        });
        
        // Format payment methods
        const formattedPaymentMethods = paymentMethods.data.map(pm => ({
          id: pm.id,
          type: pm.type,
          // File: controllers/billing.controller.js (continued)
          brand: pm.card.brand,
          last4: pm.card.last4,
          expMonth: pm.card.exp_month,
          expYear: pm.card.exp_year,
          isDefault: pm.id === tenant.defaultPaymentMethodId
        }));
        
        res.status(200).json({ paymentMethods: formattedPaymentMethods });
      } catch (stripeError) {
        console.error('Stripe payment methods error:', stripeError);
        res.status(400).json({
          message: 'Error retrieving payment methods',
          details: stripeError.message
        });
      }
    } else {
      // Tenant has no payment methods
      res.status(200).json({ paymentMethods: [] });
    }
    
  } catch (error) {
    console.error('Get payment methods error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Add a payment method
exports.addPaymentMethod = async (req, res) => {
  try {
    const { tenantId, paymentMethodId } = req.body;
    
    // Determine tenant ID based on user role
    let targetTenantId;
    
    if (req.user.userType === 'master_admin' && tenantId) {
      // Master admin can add payment method for any tenant
      targetTenantId = tenantId;
    } else if (req.user.tenantId) {
      // Tenant users can only add payment method for their tenant
      targetTenantId = req.user.tenantId;
    } else {
      return res.status(400).json({ message: 'Tenant ID is required' });
    }
    
    // Get tenant
    const tenant = await Tenant.findById(targetTenantId);
    if (!tenant) {
      return res.status(404).json({ message: 'Tenant not found' });
    }
    
    try {
      // Create or get customer
      let customerId = tenant.stripeCustomerId;
      
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: tenant.contactEmail,
          name: tenant.name
        });
        
        customerId = customer.id;
        tenant.stripeCustomerId = customerId;
        await tenant.save();
      }
      
      // Attach payment method to customer
      await stripe.paymentMethods.attach(paymentMethodId, {
        customer: customerId
      });
      
      // Get payment method details
      const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
      
      // If it's the first payment method, set as default
      const paymentMethods = await stripe.paymentMethods.list({
        customer: customerId,
        type: 'card'
      });
      
      if (paymentMethods.data.length === 1) {
        await stripe.customers.update(customerId, {
          invoice_settings: {
            default_payment_method: paymentMethodId
          }
        });
        
        tenant.defaultPaymentMethodId = paymentMethodId;
        await tenant.save();
      }
      
      // Log payment method addition
      await createAuditLog({
        userId: req.user.id,
        action: 'CREATE',
        module: 'PAYMENT_METHOD',
        description: `Added payment method for tenant ${tenant.name}`,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        tenantId: req.user.tenantId || null
      });
      
      res.status(201).json({
        message: 'Payment method added successfully',
        paymentMethod: {
          id: paymentMethod.id,
          type: paymentMethod.type,
          brand: paymentMethod.card.brand,
          last4: paymentMethod.card.last4,
          expMonth: paymentMethod.card.exp_month,
          expYear: paymentMethod.card.exp_year,
          isDefault: paymentMethods.data.length === 1
        }
      });
      
    } catch (stripeError) {
      console.error('Stripe payment method error:', stripeError);
      res.status(400).json({
        message: 'Error adding payment method',
        details: stripeError.message
      });
    }
    
  } catch (error) {
    console.error('Add payment method error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Set default payment method
exports.setDefaultPaymentMethod = async (req, res) => {
  try {
    const { tenantId, paymentMethodId } = req.body;
    
    // Determine tenant ID based on user role
    let targetTenantId;
    
    if (req.user.userType === 'master_admin' && tenantId) {
      // Master admin can set default payment method for any tenant
      targetTenantId = tenantId;
    } else if (req.user.tenantId) {
      // Tenant users can only set default payment method for their tenant
      targetTenantId = req.user.tenantId;
    } else {
      return res.status(400).json({ message: 'Tenant ID is required' });
    }
    
    // Get tenant
    const tenant = await Tenant.findById(targetTenantId);
    if (!tenant) {
      return res.status(404).json({ message: 'Tenant not found' });
    }
    
    // Check if tenant has Stripe customer ID
    if (!tenant.stripeCustomerId) {
      return res.status(400).json({ message: 'No payment methods available' });
    }
    
    try {
      // Update default payment method in Stripe
      await stripe.customers.update(tenant.stripeCustomerId, {
        invoice_settings: {
          default_payment_method: paymentMethodId
        }
      });
      
      // Update tenant
      tenant.defaultPaymentMethodId = paymentMethodId;
      await tenant.save();
      
      // Log default payment method change
      await createAuditLog({
        userId: req.user.id,
        action: 'UPDATE',
        module: 'PAYMENT_METHOD',
        description: `Set default payment method for tenant ${tenant.name}`,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        tenantId: req.user.tenantId || null
      });
      
      res.status(200).json({
        message: 'Default payment method updated successfully'
      });
      
    } catch (stripeError) {
      console.error('Stripe payment method error:', stripeError);
      res.status(400).json({
        message: 'Error setting default payment method',
        details: stripeError.message
      });
    }
    
  } catch (error) {
    console.error('Set default payment method error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Remove a payment method
exports.removePaymentMethod = async (req, res) => {
  try {
    const paymentMethodId = req.params.id;
    const { tenantId } = req.query;
    
    // Determine tenant ID based on user role
    let targetTenantId;
    
    if (req.user.userType === 'master_admin' && tenantId) {
      // Master admin can remove payment method for any tenant
      targetTenantId = tenantId;
    } else if (req.user.tenantId) {
      // Tenant users can only remove payment method for their tenant
      targetTenantId = req.user.tenantId;
    } else {
      return res.status(400).json({ message: 'Tenant ID is required' });
    }
    
    // Get tenant
    const tenant = await Tenant.findById(targetTenantId);
    if (!tenant) {
      return res.status(404).json({ message: 'Tenant not found' });
    }
    
    // Check if tenant has Stripe customer ID
    if (!tenant.stripeCustomerId) {
      return res.status(400).json({ message: 'No payment methods available' });
    }
    
    try {
      // Check if this is the default payment method
      const isDefault = tenant.defaultPaymentMethodId === paymentMethodId;
      
      // If it's the default, find another payment method to set as default
      if (isDefault) {
        const paymentMethods = await stripe.paymentMethods.list({
          customer: tenant.stripeCustomerId,
          type: 'card'
        });
        
        // Filter out the one we're deleting
        const otherPaymentMethods = paymentMethods.data.filter(pm => pm.id !== paymentMethodId);
        
        // If there are other payment methods, set one as default
        if (otherPaymentMethods.length > 0) {
          await stripe.customers.update(tenant.stripeCustomerId, {
            invoice_settings: {
              default_payment_method: otherPaymentMethods[0].id
            }
          });
          
          tenant.defaultPaymentMethodId = otherPaymentMethods[0].id;
        } else {
          tenant.defaultPaymentMethodId = null;
        }
        
        await tenant.save();
      }
      
      // Detach payment method from customer
      await stripe.paymentMethods.detach(paymentMethodId);
      
      // Log payment method removal
      await createAuditLog({
        userId: req.user.id,
        action: 'DELETE',
        module: 'PAYMENT_METHOD',
        description: `Removed payment method for tenant ${tenant.name}`,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        tenantId: req.user.tenantId || null
      });
      
      res.status(200).json({
        message: 'Payment method removed successfully'
      });
      
    } catch (stripeError) {
      console.error('Stripe payment method error:', stripeError);
      res.status(400).json({
        message: 'Error removing payment method',
        details: stripeError.message
      });
    }
    
  } catch (error) {
    console.error('Remove payment method error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Get billing metrics and statistics
exports.getBillingMetrics = async (req, res) => {
  try {
    // This endpoint is only accessible to master admins
    if (req.user.userType !== 'master_admin') {
      return res.status(403).json({ message: 'Not authorized to access billing metrics' });
    }
    
    const { period = '30d' } = req.query;
    
    // Determine date range based on period
    const endDate = new Date();
    let startDate;
    
    switch (period) {
      case '7d':
        startDate = new Date(endDate);
        startDate.setDate(endDate.getDate() - 7);
        break;
      case '30d':
        startDate = new Date(endDate);
        startDate.setDate(endDate.getDate() - 30);
        break;
      case '90d':
        startDate = new Date(endDate);
        startDate.setDate(endDate.getDate() - 90);
        break;
      case '1y':
        startDate = new Date(endDate);
        startDate.setFullYear(endDate.getFullYear() - 1);
        break;
      default:
        startDate = new Date(endDate);
        startDate.setDate(endDate.getDate() - 30);
    }
    
    // Calculate revenue
    const invoices = await Invoice.aggregate([
      { $match: { 
        status: 'paid',
        paidDate: { $gte: startDate, $lte: endDate } 
      }},
      { $group: {
        _id: null,
        totalRevenue: { $sum: '$total' },
        invoiceCount: { $sum: 1 }
      }}
    ]);
    
    // Calculate subscription stats
    const subscriptions = await Subscription.aggregate([
      { $match: { 
        status: { $in: ['active', 'trialing'] }
      }},
      { $group: {
        _id: '$plan',
        count: { $sum: 1 }
      }}
    ]);
    
    // Count tenants by plan
    const tenantsByPlan = await Tenant.aggregate([
      { $group: {
        _id: '$plan',
        count: { $sum: 1 }
      }}
    ]);
    
    // Calculate MRR (Monthly Recurring Revenue)
    const activeSubscriptions = await Subscription.find({
      status: { $in: ['active', 'trialing'] }
    });
    
    let mrr = 0;
    for (const sub of activeSubscriptions) {
      // Calculate effective monthly price
      let monthlyPrice = sub.basePrice - sub.discount;
      
      // Adjust for billing cycle
      if (sub.billingCycle === 'annual') {
        monthlyPrice = monthlyPrice / 12;
      }
      
      mrr += monthlyPrice;
    }
    
    // Get recent payments
    const recentPayments = await Payment.find({
      status: 'completed',
      paymentDate: { $gte: startDate, $lte: endDate }
    })
    .sort({ paymentDate: -1 })
    .limit(10)
    .populate('tenantId', 'name')
    .populate('invoiceId', 'invoiceNumber');
    
    // Format metrics response
    const metrics = {
      revenue: {
        total: invoices.length > 0 ? invoices[0].totalRevenue : 0,
        invoiceCount: invoices.length > 0 ? invoices[0].invoiceCount : 0,
        mrr
      },
      subscriptions: {
        byPlan: subscriptions.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        active: activeSubscriptions.length
      },
      tenants: {
        byPlan: tenantsByPlan.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {})
      },
      recentPayments: recentPayments.map(payment => ({
        id: payment._id,
        amount: payment.amount,
        tenantName: payment.tenantId.name,
        invoiceNumber: payment.invoiceId ? payment.invoiceId.invoiceNumber : 'N/A',
        paymentDate: payment.paymentDate,
        paymentMethod: payment.paymentMethod
      })),
      period: {
        start: startDate,
        end: endDate
      }
    };
    
    res.status(200).json({ metrics });
    
  } catch (error) {
    console.error('Get billing metrics error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

module.exports = exports;