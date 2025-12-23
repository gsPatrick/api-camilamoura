require('dotenv').config();
const http = require('http');
const app = require('./app');
const sequelize = require('./src/config/database');

const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

console.log('🚀 Sistema Advocacia Camila Moura - Iniciando...');

const UserService = require('./src/features/user/user.service');
const BotConfig = require('./src/models/botConfig');

// Default configurations for the bot
const DEFAULT_CONFIGS = [
    {
        key: 'AVISO_ETICO',
        value: 'Olá! Sou a assistente virtual da Dra. Camila. ⚖️\n\nAntes de prosseguirmos, informo que este canal é monitorado e suas informações serão triadas pela nossa inteligência artificial. \n\nPor favor, descreva seu caso detalhadamente.'
    },
    {
        key: 'MSG_ADVOGADO_EXISTENTE',
        value: 'Entendemos. Como você já possui advogado constituído, por ética profissional da OAB, não podemos prosseguir com o atendimento consultivo por aqui. Recomendamos que contate seu advogado atual. \n\nAtendimento encerrado.'
    },
    {
        key: 'MSG_PRESENCIAL',
        value: 'Identifiquei que seu caso pode ter urgência ou prazos curtos. 🚨\n\nRecomendamos fortemente que você agende uma visita presencial ou ligue imediatamente para nosso escritório.'
    },
    {
        key: 'TRELLO_LIST_ID',
        value: ''
    },
    {
        key: 'TRELLO_LABEL_URGENTE_ID',
        value: ''
    },
    {
        key: 'SPECIALTIES_JSON',
        value: JSON.stringify([
            { id: 1, name: 'BPC/LOAS', keywords: 'idoso, deficiente, loas, bpc, baixa renda', rules: 'Idosos > 65 anos ou Deficientes. Renda familiar de até 1/4 do salário mínimo.', urgent: false },
            { id: 2, name: 'Auxílio Doença', keywords: 'doença, acidente, inss, afastamento, cirurgia', rules: 'Problema de saúde que impeça o trabalho.', urgent: true },
            { id: 3, name: 'Aposentadoria', keywords: 'tempo de serviço, idade, contribuição', rules: 'Análise de tempo de contribuição ou idade.', urgent: false }
        ])
    },
    {
        key: 'PROMPT_SISTEMA',
        value: `Você é uma Assistente Jurídica do escritório da Dra. Camila.
Sua função é TRIAR e CLASSIFICAR o relato do cliente.

**CATEGORIAS:**
1. BPC/LOAS - Idosos > 65 ou Deficientes com baixa renda
2. Auxílio Doença - Problemas de saúde, afastamento (URGÊNCIA ALTA)
3. Aposentadoria - Tempo de contribuição, idade
4. Trabalhista - Demissão, justa causa, acidente de trabalho
5. Consumidor - Nome sujo, cobrança indevida, plano de saúde

**RESPONDA APENAS O JSON:**
{
  "client_name": "Nome ou Não informado",
  "type": "Categoria",
  "urgency": "Alta" ou "Baixa",
  "summary": "Resumo do caso"
}`
    }
];

async function startServer() {
    try {
        await sequelize.authenticate();
        console.log('Database connection has been established successfully.');

        // Sync models
        await sequelize.sync({ alter: true });
        console.log('Database synced.');

        // Seed default configurations
        console.log('Checking/seeding default configurations...');
        for (const config of DEFAULT_CONFIGS) {
            await BotConfig.findOrCreate({
                where: { key: config.key },
                defaults: config
            });
        }
        console.log('Default configurations ready.');

        // Create Default Admin User
        try {
            const adminEmail = 'camila@camilamoura.adv.br';
            const adminPass = 'camilacamilamoura.adv.bradmin123';
            const existingUser = await UserService.findByEmail(adminEmail);
            if (!existingUser) {
                console.log('Creating default admin user...');
                await UserService.createAdmin('Camila Moura', adminEmail, adminPass);
                console.log('Default admin user created: camila@camilamoura.adv.br');
            }
        } catch (uErr) {
            console.error('Error creating default user:', uErr);
        }

        server.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
        });
    } catch (error) {
        console.error('Unable to connect to the database:', error);
    }
}

startServer();
