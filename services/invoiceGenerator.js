// File: services/invoiceGenerator.js
const Invoice = require('../models/invoice.model');
const BillingPlan = require('../models/billingPlan.model');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

/**
 * Service for generating invoices and invoice PDFs
 */
class InvoiceGenerator {
  /**
   * Generate a unique invoice number
   * @returns {Promise<string>} Invoice number
   */
  static async generateInvoiceNumber() {
    // Get current date parts for prefix
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    
    // Get count of invoices for this month to use as sequence
    const startOfMonth = new Date(year, now.getMonth(), 1);
    const endOfMonth = new Date(year, now.getMonth() + 1, 0, 23, 59, 59, 999);
    
    const count = await Invoice.countDocuments({
      createdAt: { $gte: startOfMonth, $lte: endOfMonth }
    });
    
    // Format as YYYYMM-XXXXX (e.g., 202501-00001)
    const sequence = String(count + 1).padStart(5, '0');
    return `${year}${month}-${sequence}`;
  }

  /**
   * Generate a subscription invoice
   * @param {Object} subscription - Subscription document
   * @param {Object} tenant - Tenant document
   * @returns {Promise<Object>} Created invoice
   */
  static async generateSubscriptionInvoice(subscription, tenant) {
    try {
      // Get billing plan
      const billingPlan = await BillingPlan.findOne({ planId: subscription.plan });
      if (!billingPlan) {
        throw new Error(`Billing plan ${subscription.plan} not found`);
      }
      
      // Generate invoice number
      const invoiceNumber = await this.generateInvoiceNumber();
      
      // Determine period description based on billing cycle
      let periodDesc;
      switch (subscription.billingCycle) {
        case 'monthly':
          periodDesc = 'Monthly subscription';
          break;
        case 'annual':
          periodDesc = 'Annual subscription';
          break;
        default:
          periodDesc = 'Subscription';
      }
      
      // Create invoice items
      const items = [
        {
          description: `${periodDesc} - ${billingPlan.name}`,
          quantity: 1,
          unitPrice: subscription.basePrice,
          amount: subscription.basePrice,
          type: 'subscription',
          periodStart: subscription.startDate,
          periodEnd: subscription.endDate,
          details: {
            planName: billingPlan.name,
            planId: billingPlan.planId,
            billingCycle: subscription.billingCycle
          }
        }
      ];
      
      // Add setup fee if applicable
      const pricingTier = billingPlan.pricingTiers.find(tier => tier.cycle === subscription.billingCycle);
      if (pricingTier && pricingTier.setupFee > 0) {
        items.push({
          description: 'One-time setup fee',
          quantity: 1,
          unitPrice: pricingTier.setupFee,
          amount: pricingTier.setupFee,
          type: 'setup',
          details: {
            planName: billingPlan.name,
            planId: billingPlan.planId
          }
        });
      }
      
      // Calculate totals
      const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
      let total = subtotal;
      
      // Apply discount if any
      if (subscription.discount > 0) {
        total -= subscription.discount;
      }
      
      // Create invoice
      const invoice = new Invoice({
        invoiceNumber,
        tenantId: subscription.tenantId,
        subscriptionId: subscription._id,
        items,
        subtotal,
        discounts: subscription.discount || 0,
        total,
        currency: subscription.currency,
        issueDate: new Date(),
        dueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), // Due in 15 days
        status: 'issued',
        billingAddress: tenant.address || {}
      });
      
      await invoice.save();
      return invoice;
    } catch (error) {
      console.error('Error generating subscription invoice:', error);
      throw error;
    }
  }

  /**
   * Generate a proration invoice
   * @param {Object} subscription - Subscription document
   * @param {Object} tenant - Tenant document
   * @param {number} prorationAmount - Proration amount
   * @param {string} description - Invoice description
   * @returns {Promise<Object>} Created invoice
   */
  static async generateProrationInvoice(subscription, tenant, prorationAmount, description) {
    try {
      // Skip if proration amount is zero
      if (prorationAmount === 0) {
        return null;
      }
      
      // Generate invoice number
      const invoiceNumber = await this.generateInvoiceNumber();
      
      // Determine item type based on proration amount
      const itemType = prorationAmount > 0 ? 'adjustment' : 'subscription';
      const itemDesc = prorationAmount > 0 ? 
        `Credit for ${description}` : 
        `Additional charge for ${description}`;
      
      // Create invoice items
      const items = [
        {
          description: itemDesc,
          quantity: 1,
          unitPrice: Math.abs(prorationAmount),
          amount: Math.abs(prorationAmount),
          type: itemType,
          details: {
            prorationReason: description
          }
        }
      ];
      
      // Calculate totals
      const subtotal = Math.abs(prorationAmount);
      const total = subtotal;
      
      // Create invoice
      const invoice = new Invoice({
        invoiceNumber,
        tenantId: subscription.tenantId,
        subscriptionId: subscription._id,
        items,
        subtotal,
        total,
        currency: subscription.currency,
        issueDate: new Date(),
        // If credit, mark as paid immediately
        status: prorationAmount > 0 ? 'paid' : 'issued',
        paidDate: prorationAmount > 0 ? new Date() : null,
        dueDate: prorationAmount > 0 ? 
          new Date() : 
          new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), // Due in 15 days
        billingAddress: tenant.address || {}
      });
      
      await invoice.save();
      return invoice;
    } catch (error) {
      console.error('Error generating proration invoice:', error);
      throw error;
    }
  }

  /**
   * Generate invoice PDF
   * @param {Object} invoice - Invoice document
   * @returns {Promise<Buffer>} PDF buffer
   */
  static async generateInvoicePdf(invoice) {
    return new Promise((resolve, reject) => {
      try {
        // Get related data
        const tenant = invoice.tenantId;
        
        // Create PDF document
        const doc = new PDFDocument({ margin: 50 });
        
        // Collect PDF data in memory
        const buffers = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => {
          const pdfData = Buffer.concat(buffers);
          resolve(pdfData);
        });
        
        // Company logo and info
        doc.fontSize(20).text('Your Company Name', { align: 'right' });
        doc.fontSize(10).text('123 Business Street', { align: 'right' });
        doc.text('City, State 12345', { align: 'right' });
        doc.text('support@yourcompany.com', { align: 'right' });
        
        doc.moveDown();
        doc.fontSize(20).text('INVOICE', { align: 'center' });
        doc.moveDown();
        
        // Invoice details
        doc.fontSize(12).text(`Invoice Number: ${invoice.invoiceNumber}`);
        doc.text(`Issue Date: ${formatDate(invoice.issueDate)}`);
        doc.text(`Due Date: ${formatDate(invoice.dueDate)}`);
        doc.text(`Status: ${formatStatus(invoice.status)}`);
        
        if (invoice.paidDate) {
          doc.text(`Paid Date: ${formatDate(invoice.paidDate)}`);
        }
        
        doc.moveDown();
        
        // Tenant details
        doc.fontSize(12).text('Billed To:');
        doc.fontSize(10).text(tenant.name);
        
        if (invoice.billingAddress) {
          const address = invoice.billingAddress;
          if (address.street) doc.text(address.street);
          if (address.city && address.state) {
            doc.text(`${address.city}, ${address.state} ${address.postalCode || ''}`);
          }
          if (address.country) doc.text(address.country);
        }
        
        if (tenant.contactEmail) {
          doc.text(tenant.contactEmail);
        }
        
        doc.moveDown();
        
        // Invoice items
        doc.fontSize(12).text('Invoice Items:');
        doc.moveDown();
        
        // Table headers
        const tableTop = doc.y;
        const itemX = 50;
        const descriptionX = 50;
        const quantityX = 350;
        const priceX = 400;
        const amountX = 450;
        
        doc.fontSize(10)
          .text('Description', descriptionX, tableTop)
          .text('Qty', quantityX, tableTop)
          .text('Price', priceX, tableTop)
          .text('Amount', amountX, tableTop);
        
        // Draw line
        doc.moveTo(50, tableTop + 15)
          .lineTo(550, tableTop + 15)
          .stroke();
        
        // Table rows
        let rowY = tableTop + 25;
        
        invoice.items.forEach(item => {
          doc.fontSize(10)
            .text(item.description, descriptionX, rowY, { width: 280 });
            
          // Check if description went to multiple lines
          const textHeight = Math.max(doc.heightOfString(item.description, { width: 280 }), 12);
          
          doc.text(item.quantity.toString(), quantityX, rowY)
            .text(formatCurrency(item.unitPrice, invoice.currency), priceX, rowY)
            .text(formatCurrency(item.amount, invoice.currency), amountX, rowY);
          
          // Draw line
          rowY += textHeight + 5;
          doc.moveTo(50, rowY)
            .lineTo(550, rowY)
            .stroke();
          
          rowY += 10;
        });
        
        // Check if we need a new page for totals
        if (rowY > 700) {
          doc.addPage();
          rowY = 50;
        }
        
        // Totals
        rowY += 10;
        doc.fontSize(10)
          .text('Subtotal:', 350, rowY)
          .text(formatCurrency(invoice.subtotal, invoice.currency), amountX, rowY);
        
        if (invoice.discounts > 0) {
          rowY += 15;
          doc.text('Discounts:', 350, rowY)
            .text(`-${formatCurrency(invoice.discounts, invoice.currency)}`, amountX, rowY);
        }
        
        if (invoice.tax > 0) {
          rowY += 15;
          doc.text(`Tax (${invoice.taxRate || 0}%):`, 350, rowY)
            .text(formatCurrency(invoice.tax, invoice.currency), amountX, rowY);
        }
        
        // Total
        rowY += 20;
        doc.fontSize(12).font('Helvetica-Bold')
          .text('Total:', 350, rowY)
          .text(formatCurrency(invoice.total, invoice.currency), amountX, rowY);
        
        // Payment information
        doc.moveDown(3);
        doc.fontSize(10).font('Helvetica')
          .text('Payment Information', { align: 'center' })
          .moveDown(0.5);
        
        doc.text('Please include the invoice number with your payment.', { align: 'center' })
          .moveDown(0.5);
          
        if (invoice.status === 'paid') {
          doc.font('Helvetica-Bold').text('PAID', { align: 'center' });
        } else {
          doc.text('Payment terms: Net 15 days', { align: 'center' });
        }
        
        // Footer
        const pageCount = doc.bufferedPageCount;
        for (let i = 0; i < pageCount; i++) {
          doc.switchToPage(i);
          
          // Draw footer
          const footerY = doc.page.height - 50;
          doc.fontSize(8).text(
            `Invoice ${invoice.invoiceNumber} - Page ${i + 1} of ${pageCount}`,
            50, footerY,
            { align: 'center' }
          );
        }
        
        // Finalize PDF
        doc.end();
        
      } catch (error) {
        console.error('Error generating invoice PDF:', error);
        reject(error);
      }
    });
  }
}

/**
 * Format date
 * @param {Date} date - Date to format
 * @returns {string} Formatted date
 */
function formatDate(date) {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

/**
 * Format status
 * @param {string} status - Invoice status
 * @returns {string} Formatted status
 */
function formatStatus(status) {
  const statusMap = {
    'draft': 'Draft',
    'issued': 'Issued',
    'paid': 'Paid',
    'void': 'Void',
    'uncollectible': 'Uncollectible'
  };
  
  return statusMap[status] || status;
}

/**
 * Format currency
 * @param {number} amount - Amount
 * @param {string} currency - Currency code
 * @returns {string} Formatted currency
 */
function formatCurrency(amount, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'USD',
    minimumFractionDigits: 2
  }).format(amount);
}

module.exports = InvoiceGenerator;