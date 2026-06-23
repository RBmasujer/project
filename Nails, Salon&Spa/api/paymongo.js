/**
 * Dear Self - PayMongo Payment Integration
 */

const config = require('./config');
const crypto = require('crypto');

const API_BASE = 'https://api.paymongo.com/v1';

async function paymongoRequest(endpoint, method = 'GET', data = null) {
    if (!config.paymongo.enabled || !config.paymongo.secretKey) {
        throw new Error('PayMongo not configured');
    }

    const url = `${API_BASE}${endpoint}`;
    const headers = {
        'Authorization': `Basic ${Buffer.from(config.paymongo.secretKey + ':').toString('base64')}`,
        'Content-Type': 'application/json'
    };

    const response = await fetch(url, {
        method,
        headers,
        body: data ? JSON.stringify({ data: { attributes: data } }) : undefined
    });

    const result = await response.json();
    if (!response.ok) {
        throw new Error(result.errors?.[0]?.detail || 'Payment request failed');
    }
    return result.data;
}

// Create GCash Payment
async function createGCashPayment(options) {
    const { amount, returnUrl } = options;
    const amountCentavos = Math.round(parseFloat(amount) * 100);

    const source = await paymongoRequest('/sources', 'POST', {
        type: 'gcash',
        amount: amountCentavos,
        currency: 'PHP',
        redirect: {
            success: returnUrl?.success || `${process.env.APP_URL}/payment/success`,
            failed: returnUrl?.failed || `${process.env.APP_URL}/payment/failed`
        }
    });

    return {
        sourceId: source.id,
        redirectUrl: source.attributes.redirect.checkout_url,
        amount: amountCentavos
    };
}

// Create GrabPay Payment
async function createGrabPayPayment(options) {
    const { amount, returnUrl } = options;
    const amountCentavos = Math.round(parseFloat(amount) * 100);

    const source = await paymongoRequest('/sources', 'POST', {
        type: 'grab_pay',
        amount: amountCentavos,
        currency: 'PHP',
        redirect: {
            success: returnUrl?.success || `${process.env.APP_URL}/payment/success`,
            failed: returnUrl?.failed || `${process.env.APP_URL}/payment/failed`
        }
    });

    return {
        sourceId: source.id,
        redirectUrl: source.attributes.redirect.checkout_url,
        amount: amountCentavos
    };
}

// Create Maya Payment
async function createMayaPayment(options) {
    const { amount, returnUrl } = options;
    const amountCentavos = Math.round(parseFloat(amount) * 100);

    const source = await paymongoRequest('/sources', 'POST', {
        type: 'paymaya',
        amount: amountCentavos,
        currency: 'PHP',
        redirect: {
            success: returnUrl?.success || `${process.env.APP_URL}/payment/success`,
            failed: returnUrl?.failed || `${process.env.APP_URL}/payment/failed`
        }
    });

    return {
        sourceId: source.id,
        redirectUrl: source.attributes.redirect.checkout_url,
        amount: amountCentavos
    };
}

// Create Card Payment
async function createCardPayment(options) {
    const { amount, cardDetails, returnUrl } = options;
    const amountCentavos = Math.round(parseFloat(amount) * 100);

    // Create payment intent
    const intent = await paymongoRequest('/payment_intents', 'POST', {
        amount: amountCentavos,
        payment_method_allowed: ['card'],
        payment_method_options: { card: { request_three_d_secure: 'automatic' } },
        currency: 'PHP',
        description: options.description || 'Dear Self Salon Payment'
    });

    // Create payment method
    const method = await paymongoRequest('/payment_methods', 'POST', {
        type: 'card',
        details: {
            card_number: cardDetails.cardNumber,
            exp_month: parseInt(cardDetails.expiryMonth),
            exp_year: parseInt(cardDetails.expiryYear),
            cvc: cardDetails.cvc
        }
    });

    // Attach and pay
    const result = await paymongoRequest(`/payment_intents/${intent.id}/attach`, 'POST', {
        payment_method: method.id
    });

    return {
        paymentIntentId: intent.id,
        status: result.attributes.status,
        amount: amountCentavos
    };
}

// Verify webhook signature
function verifyWebhookSignature(payload, signature) {
    const secret = config.paymongo.webhookSecret;
    if (!secret) throw new Error('Webhook secret not configured');

    const computed = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(computed, 'hex'));
}

// Process webhook
async function processWebhook(payload, signature) {
    if (!verifyWebhookSignature(JSON.stringify(payload), signature)) {
        throw new Error('Invalid webhook signature');
    }

    const attrs = payload.data.attributes;
    return {
        type: payload.type,
        paymentId: attrs.payment_id || attrs.id,
        amount: attrs.amount / 100,
        status: attrs.status,
        metadata: attrs.metadata
    };
}

// Demo payment (when PayMongo not configured)
function createDemoPayment(options) {
    return {
        success: true,
        id: `demo_pay_${Date.now()}`,
        amount: Math.round(options.amount * 100),
        status: 'paid',
        created_at: new Date().toISOString()
    };
}

function isConfigured() {
    return config.paymongo.enabled && config.paymongo.secretKey && config.paymongo.publicKey;
}

function getClientConfig() {
    return {
        enabled: config.paymongo.enabled,
        publicKey: config.paymongo.publicKey,
        methods: [
            { id: 'gcash', name: 'GCash' },
            { id: 'grab_pay', name: 'GrabPay' },
            { id: 'paymaya', name: 'Maya' },
            { id: 'card', name: 'Credit/Debit Card' }
        ]
    };
}

module.exports = {
    createGCashPayment,
    createGrabPayPayment,
    createMayaPayment,
    createCardPayment,
    verifyWebhookSignature,
    processWebhook,
    createDemoPayment,
    isConfigured,
    getClientConfig
};