const BotConfig = require('../../models/botConfig');
const { trelloClient } = require('../../config/apiClients');
const boardId = process.env.TRELLO_BOARD_ID;

class ConfigController {
    async getAllConfigs(req, res) {
        try {
            const configs = await BotConfig.findAll();
            // Transform to simple object: { key: value }
            const configObj = {};
            configs.forEach(c => {
                configObj[c.key] = c.value;
            });
            res.json(configObj);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async updateConfigs(req, res) {
        try {
            // Expects array of { key: '...', value: '...' } or object { key: value }
            // Let's support object for simplicity: { "PROMPT_SISTEMA": "novo prompt..." }
            const updates = req.body;

            for (const [key, value] of Object.entries(updates)) {
                // Upsert
                const config = await BotConfig.findOne({ where: { key } });
                if (config) {
                    config.value = value;
                    await config.save();
                } else {
                    await BotConfig.create({ key, value });
                }
            }

            res.json({ message: 'Configurations updated successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async getTrelloData(req, res) {
        try {
            if (!boardId) throw new Error('TRELLO_BOARD_ID not configured');

            const [listsRes, labelsRes] = await Promise.all([
                trelloClient.get(`/boards/${boardId}/lists`),
                trelloClient.get(`/boards/${boardId}/labels`)
            ]);

            res.json({
                lists: listsRes.data.map(l => ({ id: l.id, name: l.name })),
                labels: labelsRes.data.map(l => ({ id: l.id, name: l.name, color: l.color }))
            });
        } catch (error) {
            console.error('Trello fetch error:', error.message);
            res.status(500).json({ error: 'Failed to fetch Trello data' });
        }
    }
}

module.exports = new ConfigController();
