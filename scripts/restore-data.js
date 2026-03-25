const fs = require('fs');
const path = require('path');
const sequelize = require('../src/config/database');
const User = require('../src/models/user');
const BotConfig = require('../src/models/botConfig');
const FlowConfig = require('../src/models/flowConfig');
const FlowQuestion = require('../src/models/flowQuestion');
const KnowledgeBase = require('../src/models/knowledgeBase');
const Conversation = require('../src/models/conversation');

async function restoreData() {
    const backupPath = path.join(__dirname, '../data-backup.json');
    if (!fs.existsSync(backupPath)) {
        console.log('⚠️ Arquivo de backup não encontrado em:', backupPath);
        return;
    }

    try {
        console.log('🔄 Iniciando restauração de dados...');
        await sequelize.authenticate();
        // Sincroniza o banco (cria as tabelas se não existirem)
        await sequelize.sync({ alter: true });

        const backupData = JSON.parse(fs.readFileSync(backupPath, 'utf8'));

        // 1. Restaurar Usuários
        console.log('👥 Restaurando usuários...');
        for (const userData of backupData.users) {
            await User.findOrCreate({
                where: { email: userData.email },
                defaults: userData
            });
        }

        // 2. Restaurar BotConfigs
        console.log('⚙️ Restaurando configurações do bot...');
        for (const config of backupData.botConfigs) {
            await BotConfig.upsert(config);
        }

        // 3. Restaurar FlowConfigs
        console.log('🗺️ Restaurando configurações de fluxo...');
        for (const flow of backupData.flowConfigs) {
            await FlowConfig.upsert(flow);
        }

        // 4. Restaurar FlowQuestions
        console.log('❓ Restaurando perguntas de fluxo...');
        for (const question of backupData.flowQuestions) {
            await FlowQuestion.upsert(question);
        }

        // 5. Restaurar KnowledgeBase
        console.log('📚 Restaurando base de conhecimento...');
        for (const doc of backupData.knowledgeBase) {
            await KnowledgeBase.upsert(doc);
        }

        // 6. Restaurar Conversas
        console.log('💬 Restaurando conversas...');
        for (const conv of backupData.conversations) {
            await Conversation.findOrCreate({
                where: { phone: conv.phone },
                defaults: conv
            });
        }

        console.log('✅ Restauração concluída com sucesso!');
    } catch (error) {
        console.error('❌ Erro na restauração:', error);
        throw error;
    }
}

// Se o script for chamado diretamente via node
if (require.main === module) {
    restoreData().then(() => process.exit(0)).catch(() => process.exit(1));
}

module.exports = restoreData;
