const express = require('express');
const router = express.Router();

const userRoutes = require('../features/user/user.routes');
const automationController = require('../features/automation/automation.controller');
const configRoutes = require('../features/config/config.routes');
const knowledgeRoutes = require('../features/knowledge/knowledge.routes');
const flowRoutes = require('../features/flow/flow.routes');
const Conversation = require('../models/conversation');

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

// Reset route for testing - clears conversation for a phone number
router.delete('/reset-test/:phone', async (req, res) => {
    try {
        const { phone } = req.params;
        const deleted = await Conversation.destroy({ where: { phone } });
        console.log(`[RESET] Conversa deletada para ${phone}`);
        res.json({
            success: true,
            message: `Conversa para ${phone} foi resetada. Você pode testar novamente!`,
            deleted
        });
    } catch (error) {
        console.error('Reset error:', error);
        res.status(500).json({ error: 'Erro ao resetar' });
    }
});

// Quick reset for your test number
router.get('/reset-my-test', async (req, res) => {
    const testPhone = '5571982862912';
    try {
        await Conversation.destroy({ where: { phone: testPhone } });
        console.log(`[RESET] Número de teste ${testPhone} resetado!`);
        res.json({
            success: true,
            message: `Pronto! Número ${testPhone} resetado. Pode testar novamente!`
        });
    } catch (error) {
        res.status(500).json({ error: 'Erro ao resetar' });
    }
});

router.use('/', configRoutes);
router.use('/', knowledgeRoutes);
router.use('/', flowRoutes);

module.exports = router;



