const automationService = require('./automation.service');

class AutomationController {
    async handleWebhook(req, res) {
        // A Z-API espera uma resposta rápida 200 OK
        res.status(200).send('OK');

        try {
            const webhookData = req.body;

            // Processamento assíncrono para não travar a resposta da Z-API
            await automationService.processWebhook(webhookData);
        } catch (error) {
            console.error('Webhook processing error:', error);
            // Não alteramos o status da resposta pois já foi enviada
        }
    }
}

module.exports = new AutomationController();
