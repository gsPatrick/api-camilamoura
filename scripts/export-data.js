const fs = require('fs');
const path = require('path');
const sequelize = require('../src/config/database');
const User = require('../src/models/user');
const BotConfig = require('../src/models/botConfig');
const FlowConfig = require('../src/models/flowConfig');
const FlowQuestion = require('../src/models/flowQuestion');
const KnowledgeBase = require('../src/models/knowledgeBase');
const Conversation = require('../src/models/conversation');

async function exportData() {
    try {
        console.log('🔄 Iniciando exportação de dados...');
        await sequelize.authenticate();
        console.log('✅ Conexão com o banco de dados estabelecida.');

        const data = {
            users: await User.findAll(),
            botConfigs: await BotConfig.findAll(),
            flowConfigs: await FlowConfig.findAll(),
            flowQuestions: await FlowQuestion.findAll(),
            knowledgeBase: await KnowledgeBase.findAll(),
            conversations: await Conversation.findAll()
        };

        const backupPath = path.join(__dirname, '../data-backup.json');
        fs.writeFileSync(backupPath, JSON.stringify(data, null, 2), 'utf8');

        console.log(`✅ Backup concluído com sucesso! Arquivo salvo em: ${backupPath}`);
        console.log(`📊 Total de registros:
        - Usuários: ${data.users.length}
        - Configurações do Bot: ${data.botConfigs.length}
        - Configurações de Fluxo: ${data.flowConfigs.length}
        - Perguntas de Fluxo: ${data.flowQuestions.length}
        - Base de Conhecimento: ${data.knowledgeBase.length}
        - Conversas: ${data.conversations.length}`);

        process.exit(0);
    } catch (error) {
        console.error('❌ Erro na exportação:', error);
        process.exit(1);
    }
}

exportData();
