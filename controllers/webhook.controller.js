// File: controllers/webhook.controller.js
const Subscription = require('../models/subscription.model');
const Invoice = require('../models/invoice.model');
const Payment = require('../models/payment.model');
const Tenant = require('../models/tenant.model');
const billingService = require('../services/billingService');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createAuditLog } = require('../utils/auditLogger');

/**
 * Handle Stripe webhook events
 */
exports.handleStripeWebhook = async (req, res) => {
  try {
    // Verify Stripe webhook signature
    const signature = req.headers['stripe-signature'];
    
    let event;
    try {
      event = stripe.webhooks.constructEvent(
        req.rawBody, 
        signature, 
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }
    
    console.log(`Received Stripe event: ${event.type}`);
    
    // Handle different event types
    switch (event.type) {
      case 'invoice.payment_succeeded':
        await handleInvoicePaymentSucceeded(event.data.object);
        break;
        
      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object);
        break;
        
      case 'customer.subscription.created':
        await handleSubscriptionCreated(event.data.object);
        break;
        
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object);
        break;
        
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object);
        break;
        
      case 'payment_intent.succeeded':
        await handlePaymentIntentSucceeded(event.data.object);
        break;
        
      case 'payment_intent.payment_failed':
        await handlePaymentIntentFailed(event.data.object);
        break;
        
      case 'payment_method.attached':
        await handlePaymentMethodAttached(event.data.object);
        break;
        
      case 'payment_method.detached':
        await handlePaymentMethodDetached(event.data.object);
        break;
        
      default:
        // Unhandled event type
        console.log(`Unhandled event type: ${event.type}`);
    }
    
    // Return a 200 response to acknowledge receipt of the event
    res.status(200).json({ received: true });
    
  } catch (error) {
    console.error('Webhook handler error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Handle invoice payment succeeded event
 * @param {Object} invoiceObject - Stripe invoice object
 */
async function handleInvoicePaymentSucceeded(invoiceObject) {
  try {
    console.log(`Invoice payment succeeded: ${invoiceObject.id}`);
    
    // Get customer and subscription info
    const customerId = invoiceObject.customer;
    const subscriptionId = invoiceObject.subscription;
    
    if (!customerId) {
      console.log('No customer ID in invoice, skipping');
      return;
    }
    
    // Find tenant by Stripe customer ID
    const tenant = await Tenant.findOne({ stripeCustomerId: customerId });
    if (!tenant) {
      console.log(`No tenant found for Stripe customer ${customerId}`);
      return;
    }
    
    // Handle subscription invoice
   // File: controllers/webhook.controller.js (continued)
    if (subscriptionId) {
      // Find subscription in our system
      const subscription = await Subscription.findOne({ 
        stripeSubscriptionId: subscriptionId 
      });
      
      if (subscription) {
        // Update subscription status if needed
        if (subscription.status !== 'active') {
          subscription.status = 'active';
          await subscription.save();
          
          console.log(`Updated subscription ${subscription._id} status to active`);
        }
        
        // Create or update invoice in our system
        let invoice = await Invoice.findOne({ stripeInvoiceId: invoiceObject.id });
        
        if (!invoice) {
          // Generate invoice number
          const invoiceGenerator = require('../services/invoiceGenerator');
          const invoiceNumber = await invoiceGenerator.generateInvoiceNumber();
          
          // Get line items from Stripe invoice
          const lineItems = invoiceObject.lines.data.map(item => ({
            description: item.description || 'Subscription',
            quantity: item.quantity || 1,
            unitPrice: item.unit_amount_excluding_tax / 100, // Convert cents to dollars
            amount: item.amount / 100, // Convert cents to dollars
            type: 'subscription',
            periodStart: new Date(item.period.start * 1000),
            periodEnd: new Date(item.period.end * 1000)
          }));
          
          // Create invoice
          invoice = new Invoice({
            invoiceNumber,
            tenantId: tenant._id,
            subscriptionId: subscription._id,
            items: lineItems,
            subtotal: invoiceObject.subtotal / 100, // Convert cents to dollars
            total: invoiceObject.total / 100, // Convert cents to dollars
            currency: invoiceObject.currency.toUpperCase(),
            issueDate: new Date(invoiceObject.created * 1000),
            dueDate: new Date(invoiceObject.due_date * 1000),
            status: 'paid',
            paidDate: new Date(),
            stripeInvoiceId: invoiceObject.id
          });
          
          await invoice.save();
          console.log(`Created new invoice ${invoice._id} for subscription ${subscription._id}`);
        } else {
          // Update existing invoice
          invoice.status = 'paid';
          invoice.paidDate = new Date();
          await invoice.save();
          
          console.log(`Updated invoice ${invoice._id} status to paid`);
        }
        
        // Create payment record
        const payment = new Payment({
          tenantId: tenant._id,
          invoiceId: invoice._id,
          amount: invoiceObject.total / 100, // Convert cents to dollars
          currency: invoiceObject.currency.toUpperCase(),
          paymentMethod: getPaymentMethodType(invoiceObject.payment_intent),
          paymentMethodDetails: await getPaymentMethodDetails(invoiceObject.payment_intent),
          gateway: 'stripe',
          gatewayPaymentId: invoiceObject.payment_intent,
          status: 'completed',
          paymentDate: new Date(),
          reference: `Stripe Invoice ${invoiceObject.number}`
        });
        
        await payment.save();
        console.log(`Created payment record ${payment._id} for invoice ${invoice._id}`);
        
        // Log the payment
        await createAuditLog({
          userId: null, // System-generated
          action: 'PAYMENT',
          module: 'BILLING',
          description: `Payment received for invoice ${invoice.invoiceNumber}`,
          tenantId: tenant._id
        });
      } else {
        console.log(`No subscription found for Stripe subscription ${subscriptionId}`);
      }
    }
    // Handle non-subscription invoice
    else {
      console.log(`Non-subscription invoice ${invoiceObject.id} paid`);
      
      // Try to find invoice by payment intent
      if (invoiceObject.payment_intent) {
        const invoice = await Invoice.findOne({ paymentIntentId: invoiceObject.payment_intent });
        
        if (invoice) {
          // Update invoice status
          invoice.status = 'paid';
          invoice.paidDate = new Date();
          invoice.stripeInvoiceId = invoiceObject.id;
          await invoice.save();
          
          console.log(`Updated invoice ${invoice._id} status to paid`);
          
          // Create payment record
          const payment = new Payment({
            tenantId: tenant._id,
            invoiceId: invoice._id,
            amount: invoiceObject.total / 100, // Convert cents to dollars
            currency: invoiceObject.currency.toUpperCase(),
            paymentMethod: getPaymentMethodType(invoiceObject.payment_intent),
            paymentMethodDetails: await getPaymentMethodDetails(invoiceObject.payment_intent),
            gateway: 'stripe',
            gatewayPaymentId: invoiceObject.payment_intent,
            status: 'completed',
            paymentDate: new Date(),
            reference: `Stripe Invoice ${invoiceObject.number}`
          });
          
          await payment.save();
          console.log(`Created payment record ${payment._id} for invoice ${invoice._id}`);
          
          // Log the payment
          await createAuditLog({
            userId: null, // System-generated
            action: 'PAYMENT',
            module: 'BILLING',
            description: `Payment received for invoice ${invoice.invoiceNumber}`,
            tenantId: tenant._id
          });
        }
      }
    }
  } catch (error) {
    console.error('Error handling invoice payment succeeded:', error);
  }
}

/**
 * Handle invoice payment failed event
 * @param {Object} invoiceObject - Stripe invoice object
 */
async function handleInvoicePaymentFailed(invoiceObject) {
  try {
    console.log(`Invoice payment failed: ${invoiceObject.id}`);
    
    // Get customer and subscription info
    const customerId = invoiceObject.customer;
    const subscriptionId = invoiceObject.subscription;
    
    if (!customerId) {
      console.log('No customer ID in invoice, skipping');
      return;
    }
    
    // Find tenant by Stripe customer ID
    const tenant = await Tenant.findOne({ stripeCustomerId: customerId });
    if (!tenant) {
      console.log(`No tenant found for Stripe customer ${customerId}`);
      return;
    }
    
    // Handle subscription invoice
    if (subscriptionId) {
      // Find subscription in our system
      const subscription = await Subscription.findOne({ 
        stripeSubscriptionId: subscriptionId 
      });
      
      if (subscription) {
        // Update subscription status
        subscription.status = 'past_due';
        await subscription.save();
        
        console.log(`Updated subscription ${subscription._id} status to past_due`);
        
        // Send payment failed notification
        const emailService = require('../services/emailService');
        await emailService.sendPaymentFailedNotification(tenant, subscription);
        
        // Log the payment failure
        await createAuditLog({
          userId: null, // System-generated
          action: 'PAYMENT_FAILED',
          module: 'BILLING',
          description: `Payment failed for subscription ${subscription._id}`,
          tenantId: tenant._id
        });
      } else {
        console.log(`No subscription found for Stripe subscription ${subscriptionId}`);
      }
    }
  } catch (error) {
    console.error('Error handling invoice payment failed:', error);
  }
}

/**
 * Handle subscription created event
 * @param {Object} subscriptionObject - Stripe subscription object
 */
async function handleSubscriptionCreated(subscriptionObject) {
  try {
    console.log(`Subscription created: ${subscriptionObject.id}`);
    
    // Get customer info
    const customerId = subscriptionObject.customer;
    
    if (!customerId) {
      console.log('No customer ID in subscription, skipping');
      return;
    }
    
    // Find tenant by Stripe customer ID
    const tenant = await Tenant.findOne({ stripeCustomerId: customerId });
    if (!tenant) {
      console.log(`No tenant found for Stripe customer ${customerId}`);
      return;
    }
    
    // Check if subscription already exists in our system
    const existingSubscription = await Subscription.findOne({ 
      stripeSubscriptionId: subscriptionObject.id 
    });
    
    if (existingSubscription) {
      console.log(`Subscription ${subscriptionObject.id} already exists in our system`);
      return;
    }
    
    // Get plan info from first item
    const item = subscriptionObject.items.data[0];
    if (!item || !item.price || !item.price.product) {
      console.log('No price or product info in subscription, skipping');
      return;
    }
    
    // Find billing plan by Stripe product ID
    const BillingPlan = require('../models/billingPlan.model');
    const billingPlan = await BillingPlan.findOne({ 
      stripeProductId: item.price.product 
    });
    
    if (!billingPlan) {
      console.log(`No billing plan found for Stripe product ${item.price.product}`);
      return;
    }
    
    // Determine billing cycle
    let billingCycle = 'monthly';
    if (item.price.recurring && item.price.recurring.interval) {
      billingCycle = item.price.recurring.interval === 'year' ? 'annual' : 'monthly';
    }
    
    // Calculate dates
    const startDate = new Date(subscriptionObject.current_period_start * 1000);
    const endDate = new Date(subscriptionObject.current_period_end * 1000);
    
    // Determine trial end date if applicable
    let trialEndDate = null;
    if (subscriptionObject.trial_end) {
      trialEndDate = new Date(subscriptionObject.trial_end * 1000);
    }
    
    // Create subscription in our system
    const subscription = new Subscription({
      tenantId: tenant._id,
      plan: billingPlan.planId,
      billingCycle,
      basePrice: item.price.unit_amount / 100, // Convert cents to dollars
      currency: item.price.currency.toUpperCase(),
      startDate,
      endDate,
      trialEndDate,
      status: trialEndDate ? 'trialing' : 'active',
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscriptionObject.id,
      paymentMethod: 'credit_card', // Assuming Stripe uses credit cards
      autoRenew: true
    });
    
    await subscription.save();
    console.log(`Created subscription ${subscription._id} for tenant ${tenant._id}`);
    
    // Update tenant plan
    tenant.plan = billingPlan.planId;
    await tenant.save();
    
    // Create usage record
    const UsageRecord = require('../models/usageRecord.model');
    const usageRecord = new UsageRecord({
      tenantId: tenant._id,
      subscriptionId: subscription._id,
      startDate,
      endDate,
      metrics: {
        activeUsers: {
          count: await billingService.getActiveTenantUserCount(tenant._id),
          limit: billingPlan.limits.users,
          overageCount: 0
        },
        storage: {
          usedBytes: await billingService.getTenantStorageUsage(tenant._id),
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
    
    // Log the subscription creation
    await createAuditLog({
      userId: null, // System-generated
      action: 'CREATE',
      module: 'SUBSCRIPTION',
      description: `Subscription created via Stripe for tenant ${tenant.name}`,
      tenantId: tenant._id
    });
  } catch (error) {
    console.error('Error handling subscription created:', error);
  }
}

/**
 * Handle subscription updated event
 * @param {Object} subscriptionObject - Stripe subscription object
 */
async function handleSubscriptionUpdated(subscriptionObject) {
  try {
    console.log(`Subscription updated: ${subscriptionObject.id}`);
    
    // Find subscription in our system
    const subscription = await Subscription.findOne({ 
      stripeSubscriptionId: subscriptionObject.id 
    });
    
    if (!subscription) {
      console.log(`No subscription found for Stripe subscription ${subscriptionObject.id}`);
      return;
    }
    
    // Get tenant
    const tenant = await Tenant.findById(subscription.tenantId);
    if (!tenant) {
      console.log(`No tenant found for subscription ${subscription._id}`);
      return;
    }
    
    // Update status if needed
    let statusChanged = false;
    const newStatus = getSubscriptionStatus(subscriptionObject);
    
    if (newStatus !== subscription.status) {
      const oldStatus = subscription.status;
      subscription.status = newStatus;
      statusChanged = true;
      
      console.log(`Updated subscription ${subscription._id} status from ${oldStatus} to ${newStatus}`);
    }
    
    // Update cancel at period end if applicable
    if (subscriptionObject.cancel_at_period_end !== undefined) {
      subscription.autoRenew = !subscriptionObject.cancel_at_period_end;
    }
    
    // Update dates
    subscription.startDate = new Date(subscriptionObject.current_period_start * 1000);
    subscription.endDate = new Date(subscriptionObject.current_period_end * 1000);
    
    if (subscriptionObject.trial_end) {
      subscription.trialEndDate = new Date(subscriptionObject.trial_end * 1000);
    }
    
    // Save changes
    await subscription.save();
    
    // If canceled, update tenant plan
    if (newStatus === 'canceled' && statusChanged) {
      tenant.plan = 'free';
      await tenant.save();
      
      // Log the cancellation
      await createAuditLog({
        userId: null, // System-generated
        action: 'CANCEL',
        module: 'SUBSCRIPTION',
        description: `Subscription canceled via Stripe for tenant ${tenant.name}`,
        tenantId: tenant._id
      });
      
      // Send cancellation notification
      const emailService = require('../services/emailService');
      await emailService.sendSubscriptionCancellationNotification(
        tenant, 
        subscription, 
        true, // Immediate cancellation
        'Subscription canceled via Stripe'
      );
    }
  } catch (error) {
    console.error('Error handling subscription updated:', error);
  }
}

/**
 * Handle subscription deleted event
 * @param {Object} subscriptionObject - Stripe subscription object
 */
async function handleSubscriptionDeleted(subscriptionObject) {
  try {
    console.log(`Subscription deleted: ${subscriptionObject.id}`);
    
    // Find subscription in our system
    const subscription = await Subscription.findOne({ 
      stripeSubscriptionId: subscriptionObject.id 
    });
    
    if (!subscription) {
      console.log(`No subscription found for Stripe subscription ${subscriptionObject.id}`);
      return;
    }
    
    // Get tenant
    const tenant = await Tenant.findById(subscription.tenantId);
    if (!tenant) {
      console.log(`No tenant found for subscription ${subscription._id}`);
      return;
    }
    
    // Update subscription status
    subscription.status = 'canceled';
    subscription.canceledAt = new Date();
    await subscription.save();
    
    // Update tenant to free plan
    tenant.plan = 'free';
    await tenant.save();
    
    // Log the deletion
    await createAuditLog({
      userId: null, // System-generated
      action: 'CANCEL',
      module: 'SUBSCRIPTION',
      description: `Subscription deleted via Stripe for tenant ${tenant.name}`,
      tenantId: tenant._id
    });
    
    // Send cancellation notification
    const emailService = require('../services/emailService');
    await emailService.sendSubscriptionCancellationNotification(
      tenant, 
      subscription, 
      true, // Immediate cancellation
      'Subscription deleted via Stripe'
    );
  } catch (error) {
    console.error('Error handling subscription deleted:', error);
  }
}

/**
 * Handle payment intent succeeded event
 * @param {Object} paymentIntent - Stripe payment intent object
 */
async function handlePaymentIntentSucceeded(paymentIntent) {
  try {
    console.log(`Payment intent succeeded: ${paymentIntent.id}`);
    
    // Skip if this payment intent is for a subscription (already handled by invoice events)
    if (paymentIntent.invoice) {
      console.log(`Payment intent is for invoice ${paymentIntent.invoice}, skipping`);
      return;
    }
    
    // Check metadata for invoice reference
    if (paymentIntent.metadata && paymentIntent.metadata.invoiceId) {
      const invoiceId = paymentIntent.metadata.invoiceId;
      
      // Find invoice in our system
      const invoice = await Invoice.findById(invoiceId);
      if (!invoice) {
        console.log(`No invoice found for ID ${invoiceId}`);
        return;
      }
      
      // Update invoice status
      invoice.status = 'paid';
      invoice.paidDate = new Date();
      invoice.paymentIntentId = paymentIntent.id;
      await invoice.save();
      
      console.log(`Updated invoice ${invoice._id} status to paid`);
      
      // Get tenant
      const tenant = await Tenant.findById(invoice.tenantId);
      if (!tenant) {
        console.log(`No tenant found for invoice ${invoice._id}`);
        return;
      }
      
      // Create payment record
      const payment = new Payment({
        tenantId: invoice.tenantId,
        invoiceId: invoice._id,
        amount: paymentIntent.amount / 100, // Convert cents to dollars
        currency: paymentIntent.currency.toUpperCase(),
        paymentMethod: getPaymentMethodType(paymentIntent),
        paymentMethodDetails: await getPaymentMethodDetails(paymentIntent),
        gateway: 'stripe',
        gatewayPaymentId: paymentIntent.id,
        status: 'completed',
        paymentDate: new Date(),
        reference: `Invoice ${invoice.invoiceNumber}`,
        receiptUrl: paymentIntent.charges.data[0] ? paymentIntent.charges.data[0].receipt_url : null
      });
      
      await payment.save();
      console.log(`Created payment record ${payment._id} for invoice ${invoice._id}`);
      
      // Log the payment
      await createAuditLog({
        userId: null, // System-generated
        action: 'PAYMENT',
        module: 'BILLING',
        description: `Payment received for invoice ${invoice.invoiceNumber}`,
        tenantId: invoice.tenantId
      });
      
      // Send payment receipt
      const emailService = require('../services/emailService');
      await emailService.sendPaymentReceipt(tenant, invoice, {
        success: true,
        paymentId: payment._id,
        receiptUrl: payment.receiptUrl
      });
    } else {
      console.log('No invoice reference in payment intent metadata, skipping');
    }
  } catch (error) {
    console.error('Error handling payment intent succeeded:', error);
  }
}

/**
 * Handle payment intent failed event
 * @param {Object} paymentIntent - Stripe payment intent object
 */
async function handlePaymentIntentFailed(paymentIntent) {
  try {
    console.log(`Payment intent failed: ${paymentIntent.id}`);
    
    // Skip if this payment intent is for a subscription (already handled by invoice events)
    if (paymentIntent.invoice) {
      console.log(`Payment intent is for invoice ${paymentIntent.invoice}, skipping`);
      return;
    }
    
    // Check metadata for invoice reference
    if (paymentIntent.metadata && paymentIntent.metadata.invoiceId) {
      const invoiceId = paymentIntent.metadata.invoiceId;
      
      // Find invoice in our system
      const invoice = await Invoice.findById(invoiceId);
      if (!invoice) {
        console.log(`No invoice found for ID ${invoiceId}`);
        return;
      }
      
      // Update invoice attempt count
      invoice.attemptCount = (invoice.attemptCount || 0) + 1;
      invoice.lastAttemptDate = new Date();
      await invoice.save();
      
      console.log(`Updated invoice ${invoice._id} attempt count to ${invoice.attemptCount}`);
      
      // Get tenant
      const tenant = await Tenant.findById(invoice.tenantId);
      if (!tenant) {
        console.log(`No tenant found for invoice ${invoice._id}`);
        return;
      }
      
      // Log the payment failure
      await createAuditLog({
        userId: null, // System-generated
        action: 'PAYMENT_FAILED',
        module: 'BILLING',
        description: `Payment failed for invoice ${invoice.invoiceNumber}`,
        tenantId: invoice.tenantId
      });
      
      // Send payment failure notification
      const emailService = require('../services/emailService');
      await emailService.sendPaymentFailedNotification(tenant, null, invoice);
    } else {
      console.log('No invoice reference in payment intent metadata, skipping');
    }
  } catch (error) {
    console.error('Error handling payment intent failed:', error);
  }
}

/**
 * Handle payment method attached event
 * @param {Object} paymentMethod - Stripe payment method object
 */
async function handlePaymentMethodAttached(paymentMethod) {
  try {
    console.log(`Payment method attached: ${paymentMethod.id}`);
    
    // Skip if no customer ID
    if (!paymentMethod.customer) {
      console.log('No customer ID in payment method, skipping');
      return;
    }
    
    // Find tenant by Stripe customer ID
    const tenant = await Tenant.findOne({ stripeCustomerId: paymentMethod.customer });
    if (!tenant) {
      console.log(`No tenant found for Stripe customer ${paymentMethod.customer}`);
      return;
    }
    
    // Check if this is the tenant's first payment method
    const paymentMethods = await stripe.paymentMethods.list({
      customer: tenant.stripeCustomerId,
      type: paymentMethod.type
    });
    
    // If this is the first payment method, set as default
    if (paymentMethods.data.length === 1) {
      tenant.defaultPaymentMethodId = paymentMethod.id;
      await tenant.save();
      
      console.log(`Set ${paymentMethod.id} as default payment method for tenant ${tenant._id}`);
    }
    
    // Log the payment method addition
    await createAuditLog({
      userId: null, // System-generated
      action: 'CREATE',
      module: 'PAYMENT_METHOD',
      description: `Payment method added via Stripe for tenant ${tenant.name}`,
      tenantId: tenant._id
    });
  } catch (error) {
    console.error('Error handling payment method attached:', error);
  }
}

/**
 * Handle payment method detached event
 * @param {Object} paymentMethod - Stripe payment method object
 */
async function handlePaymentMethodDetached(paymentMethod) {
  try {
    console.log(`Payment method detached: ${paymentMethod.id}`);
    
    // Find tenant by payment method ID
    const tenant = await Tenant.findOne({ defaultPaymentMethodId: paymentMethod.id });
    if (tenant) {
      // If this was the default payment method, find a new one
      console.log(`Removing default payment method ${paymentMethod.id} for tenant ${tenant._id}`);
      
      // Check if tenant has Stripe customer ID
      if (tenant.stripeCustomerId) {
        // Get remaining payment methods
        const paymentMethods = await stripe.paymentMethods.list({
          customer: tenant.stripeCustomerId,
          type: paymentMethod.type
        });
        
        // If there are other payment methods, set one as default
        if (paymentMethods.data.length > 0) {
          tenant.defaultPaymentMethodId = paymentMethods.data[0].id;
        } else {
          tenant.defaultPaymentMethodId = null;
        }
        
        await tenant.save();
      }
      
      // Log the payment method removal
      await createAuditLog({
        userId: null, // System-generated
        action: 'DELETE',
        module: 'PAYMENT_METHOD',
        description: `Payment method removed via Stripe for tenant ${tenant.name}`,
        tenantId: tenant._id
      });
    }
  } catch (error) {
    console.error('Error handling payment method detached:', error);
  }
}

/**
 * Get payment method type from payment intent
 * @param {string} paymentIntentId - Stripe payment intent ID
 * @returns {string} Payment method type
 */
async function getPaymentMethodType(paymentIntentId) {
  try {
    // If no payment intent ID, return default
    if (!paymentIntentId) {
      return 'unknown';
    }
    
    // Get payment intent from Stripe
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, {
      expand: ['payment_method']
    });
    
    // Get payment method type
    if (paymentIntent.payment_method && paymentIntent.payment_method.type) {
      switch (paymentIntent.payment_method.type) {
        case 'card':
          return 'credit_card';
        case 'bank_transfer':
        case 'sepa_debit':
        case 'ach_debit':
          return 'bank_transfer';
        default:
          return paymentIntent.payment_method.type;
      }
    }
    
    return 'unknown';
  } catch (error) {
    console.error('Error getting payment method type:', error);
    return 'unknown';
  }
}

/**
 * Get payment method details from payment intent
 * @param {string} paymentIntentId - Stripe payment intent ID
 * @returns {Object} Payment method details
 */
async function getPaymentMethodDetails(paymentIntentId) {
  try {
    // If no payment intent ID, return empty object
    if (!paymentIntentId) {
      return {};
    }
    
    // Get payment intent from Stripe
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, {
      expand: ['payment_method']
    });
    
    // Get payment method details
    if (paymentIntent.payment_method) {
      if (paymentIntent.payment_method.type === 'card' && paymentIntent.payment_method.card) {
        return {
          cardBrand: paymentIntent.payment_method.card.brand,
          cardLast4: paymentIntent.payment_method.card.last4,
          cardExpMonth: paymentIntent.payment_method.card.exp_month,
          cardExpYear: paymentIntent.payment_method.card.exp_year,
          description: `${paymentIntent.payment_method.card.brand} ending in ${paymentIntent.payment_method.card.last4}`
        };
      } else if (['bank_transfer', 'sepa_debit', 'ach_debit'].includes(paymentIntent.payment_method.type)) {
        const bank = paymentIntent.payment_method.sepa_debit || 
                     paymentIntent.payment_method.ach_debit || 
                     {};
        
        return {
          bankName: bank.bank_name || 'Bank',
          accountLast4: bank.last4 || '',
          description: bank.bank_name ? `${bank.bank_name} account` : 'Bank transfer'
        };
      }
    }
    
    return {};
  } catch (error) {
    console.error('Error getting payment method details:', error);
    return {};
  }
}

/**
 * Map Stripe subscription status to our status
 * @param {Object} subscriptionObject - Stripe subscription object
 * @returns {string} Subscription status
 */
function getSubscriptionStatus(subscriptionObject) {
  switch (subscriptionObject.status) {
    case 'active':
      return 'active';
    case 'trialing':
      return 'trialing';
    case 'past_due':
      return 'past_due';
    case 'canceled':
    case 'unpaid':
      return 'canceled';
    case 'incomplete':
    case 'incomplete_expired':
      return 'incomplete';
    default:
      return subscriptionObject.status;
  }
}