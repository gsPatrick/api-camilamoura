const express = require('express');
const router = express.Router();

const userRoutes = require('../features/user/user.routes');
const automationController = require('../features/automation/automation.controller');
const configRoutes = require('../features/config/config.routes');

router.use('/', userRoutes);

// Webhook routes - both paths work
router.post('/webhook', automationController.handleWebhook);
router.post('/webhook/zapi', automationController.handleWebhook);

// Debug: Log incoming webhook data
router.post('/webhook-debug', (req, res) => {
    console.log('=== WEBHOOK DEBUG ===');
    console.log('Headers:', JSON.stringify(req.headers, null, 2));
    console.log('Body:', JSON.stringify(req.body, null, 2));
    console.log('=== END DEBUG ===');
    res.status(200).json({ received: true, body: req.body });
});

router.use('/', configRoutes);

module.exports = router;
