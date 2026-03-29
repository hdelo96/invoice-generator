const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(express.static('public'));

// Enable multipart for file uploads
app.use(bodyParser.urlencoded({ extended: true }));

// In-memory storage for MVP
let invoices = [];
let businesses = [];
let templates = [
  { id: 'modern', name: 'Modern', default: true },
  { id: 'classic', name: 'Classic' },
  { id: 'minimal', name: 'Minimal' }
];

// Initialize with sample data
businesses.push({
  id: 'default',
  name: 'Your Business Name',
  email: 'you@example.com',
  address: '123 Business St, City, Country',
  phone: '',
  logo: ''
});

// API Routes

// Get all invoices
app.get('/api/invoices', (req, res) => {
  res.json(invoices);
});

// Get single invoice
app.get('/api/invoices/:id', (req, res) => {
  const invoice = invoices.find(i => i.id === req.params.id);
  if (!invoice) {
    return res.status(404).json({ error: 'Invoice not found' });
  }
  res.json(invoice);
});

// Create invoice
app.post('/api/invoices', (req, res) => {
  const invoice = {
    id: uuidv4(),
    invoiceNumber: generateInvoiceNumber(),
    createdAt: new Date().toISOString(),
    dueDate: req.body.dueDate || addDays(new Date(), 30),
    status: 'draft',
    
    // From business
    business: req.body.business || businesses[0],
    
    // Client info
    client: req.body.client || {
      name: '',
      email: '',
      address: ''
    },
    
    // Line items
    items: req.body.items || [],
    
    // Settings
    currency: req.body.currency || 'USD',
    taxRate: req.body.taxRate || 0,
    notes: req.body.notes || '',
    
    // Branding (paid feature)
    primaryColor: '#1a1a2e',
    accentColor: '#e94560'
  };
  
  // Calculate totals
  invoice.subtotal = calculateSubtotal(invoice.items);
  invoice.taxAmount = invoice.subtotal * (invoice.taxRate / 100);
  invoice.total = invoice.subtotal + invoice.taxAmount;
  
  invoices.push(invoice);
  res.json(invoice);
});

// Update invoice
app.put('/api/invoices/:id', (req, res) => {
  const index = invoices.findIndex(i => i.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: 'Invoice not found' });
  }
  
  const invoice = { ...invoices[index], ...req.body };
  invoice.subtotal = calculateSubtotal(invoice.items);
  invoice.taxAmount = invoice.subtotal * (invoice.taxRate / 100);
  invoice.total = invoice.subtotal + invoice.taxAmount;
  
  invoices[index] = invoice;
  res.json(invoice);
});

// Delete invoice
app.delete('/api/invoices/:id', (req, res) => {
  const index = invoices.findIndex(i => i.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: 'Invoice not found' });
  }
  invoices.splice(index, 1);
  res.json({ success: true });
});

// Get/set business profile
app.get('/api/business', (req, res) => {
  res.json(businesses);
});

app.post('/api/business', (req, res) => {
  const business = {
    id: 'default',
    ...req.body
  };
  businesses[0] = business;
  res.json(business);
});

// Upload logo
app.post('/api/business/logo', (req, res) => {
  const { logo, logoFileName } = req.body;
  if (!businesses[0]) {
    businesses[0] = { id: 'default' };
  }
  businesses[0].logo = logo;
  businesses[0].logoFileName = logoFileName;
  res.json({ success: true, logo: businesses[0].logo });
});

// Get templates
app.get('/api/templates', (req, res) => {
  res.json(templates);
});

// Generate PDF
app.post('/api/invoices/:id/pdf', (req, res) => {
  const invoice = invoices.find(i => i.id === req.params.id);
  if (!invoice) {
    return res.status(404).json({ error: 'Invoice not found' });
  }

  const pdfHtml = generatePdfHtml(invoice);
  res.json({ html: pdfHtml });
});

// Helpers
function generateInvoiceNumber() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return 'INV-' + year + month + '-' + random;
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result.toISOString().split('T')[0];
}

function calculateSubtotal(items) {
  return items.reduce((sum, item => {
    return sum + (item.quantity * item.price);
  }, 0);
}

// Generate PDF-ready HTML
function generatePdfHtml(invoice) {
  const items = invoice.items || [];
  const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.price), 0);
  const taxAmount = subtotal * ((invoice.taxRate || 0) / 100);
  const total = subtotal + taxAmount;
  
  const formatCurrency = (amount, currency) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(amount);
  };

  return '<!DOCTYPE html>\n<html>\n<head>\n  <meta charset="UTF-8">\n  <title>Invoice ' + invoice.invoiceNumber + '</title>\n  <style>\n    * { box-sizing: border-box; margin: 0; padding: 0; }\n    body { font-family: Helvetica Neue, Arial, sans-serif; line-height: 1.5; color: #333; padding: 40px; max-width: 800px; margin: 0 auto; }\n    .header { display: flex; justify-content: space-between; margin-bottom: 40px; }\n    .logo { max-width: 180px; max-height: 80px; }\n    .invoice-title { font-size: 32px; font-weight: bold; color: ' + (invoice.primaryColor || '#1a1a2e') + '; letter-spacing: 4px; text-transform: uppercase; }\n    .invoice-number { color: #666; margin-top: 4px; }\n    .meta { text-align: right; }\n    .meta .label { font-size: 11px; color: #999; text-transform: uppercase; }\n    .meta .value { font-size: 14px; font-weight: 500; }\n    .parties { display: flex; justify-content: space-between; margin: 30px 0; }\n    .party { width: 45%; }\n    .party-label { font-size: 11px; color: #999; text-transform: uppercase; margin-bottom: 4px; }\n    .party-name { font-size: 16px; font-weight: bold; color: ' + (invoice.primaryColor || '#1a1a2e') + '; }\n    .party-details { font-size: 13px; color: #666; }\n    table { width: 100%; border-collapse: collapse; margin: 30px 0; }\n    th { background: ' + (invoice.primaryColor || '#1a1a2e') + '; color: white; padding: 12px; text-align: left; font-size: 11px; text-transform: uppercase; }\n    th:last-child, td:last-child { text-align: right; }\n    td { padding: 12px; border-bottom: 1px solid #eee; font-size: 13px; }\n    .totals { margin-top: 20px; }\n    .totals .row { display: flex; justify-content: flex-end; padding: 6px 0; }\n    .totals .label { width: 150px; color: #666; }\n    .totals .value { width: 120px; text-align: right; }\n    .totals .total-row { font-size: 18px; font-weight: bold; border-top: 2px solid ' + (invoice.primaryColor || '#1a1a2e') + '; padding-top: 10px; margin-top: 10px; }\n    .notes { margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; }\n    .notes h4 { font-size: 11px; color: #999; text-transform: uppercase; margin-bottom: 8px; }\n    .notes p { font-size: 13px; color: #666; white-space: pre-wrap; }\n  </style>\n</head>\n<body>\n  <div class="header">\n    <div>\n      ' + (invoice.business && invoice.business.logo ? '<img src="' + invoice.business.logo + '" class="logo" alt="Logo">' : '') + '\n      <div class="invoice-title">INVOICE</div>\n      <div class="invoice-number">#' + invoice.invoiceNumber + '</div>\n    </div>\n    <div class="meta">\n      <div class="label">Date</div>\n      <div class="value">' + new Date(invoice.createdAt).toLocaleDateString() + '</div>\n      <div class="label" style="margin-top: 8px;">Due Date</div>\n      <div class="value">' + invoice.dueDate + '</div>\n    </div>\n  </div>\n  <div class="parties">\n    <div class="party">\n      <div class="party-label">From</div>\n      <div class="party-name">' + (invoice.business ? invoice.business.name : 'Your Business') + '</div>\n      <div class="party-details">' + (invoice.business ? invoice.business.address.replace(/\n/g, '<br>') : '') + '</div>\n      <div class="party-details">' + (invoice.business ? invoice.business.email : '') + '</div>\n    </div>\n    <div class="party">\n      <div class="party-label">Bill To</div>\n      <div class="party-name">' + (invoice.client ? invoice.client.name : 'Client') + '</div>\n      <div class="party-details">' + (invoice.client ? invoice.client.address.replace(/\n/g, '<br>') : '') + '</div>\n      <div class="party-details">' + (invoice.client ? invoice.client.email : '') + '</div>\n    </div>\n  </div>\n  <table>\n    <thead>\n      <tr><th>Description</th><th>Qty</th><th>Price</th><th>Total</th></tr>\n    </thead>\n    <tbody>\n      ' + items.map(item => '<tr><td>' + item.description + '</td><td>' + item.quantity + '</td><td>' + formatCurrency(item.price, invoice.currency) + '</td><td>' + formatCurrency(item.quantity * item.price, invoice.currency) + '</td></tr>').join('') + '\n    </tbody>\n  </table>\n  <div class="totals">\n    <div class="row"><span class="label">Subtotal</span><span class="value">' + formatCurrency(subtotal, invoice.currency) + '</span></div>\n    ' + (invoice.taxRate > 0 ? '<div class="row"><span class="label">Tax (' + invoice.taxRate + '%)</span><span class="value">' + formatCurrency(taxAmount, invoice.currency) + '</span></div>' : '') + '\n    <div class="row total-row"><span class="label">Total Due</span><span class="value">' + formatCurrency(total, invoice.currency) + '</span></div>\n  </div>\n  ' + (invoice.notes ? '<div class="notes"><h4>Notes</h4><p>' + invoice.notes + '</p></div>' : '') + '\n</body>\n</html>';
}

app.listen(PORT, () => {
  console.log('Invoice Generator running on port ' + PORT);
});
