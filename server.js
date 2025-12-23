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
        value: 'Olá! Você entrou em contato com o escritório da Dra. Camila Moura. ⚖️\n\nAtuamos nas áreas de Direito Previdenciário, Trabalhista e do Consumidor.\n\nPor favor, descreva brevemente sua situação para que possamos direcionar seu atendimento.'
    },
    {
        key: 'MSG_ADVOGADO_EXISTENTE',
        value: 'Entendemos. Como você já possui advogado constituído, por ética profissional (OAB), não podemos prosseguir com o atendimento. Recomendamos que contate seu advogado atual.\n\nAtendimento encerrado.'
    },
    {
        key: 'MSG_PRESENCIAL',
        value: 'Identificamos que seu caso envolve questões que requerem uma análise presencial inicial (perícia médica, documentação de saúde ou prazos urgentes). 🏢\n\nPor favor, entre em contato pelo telefone (XX) XXXXX-XXXX para agendar uma consulta.'
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
            { id: 1, name: 'BPC Idoso', keywords: 'idoso, 65 anos, nunca trabalhou, baixa renda', rules: 'Pessoas com 65+ anos, baixa renda, nunca contribuíram ao INSS.', urgent: false },
            { id: 2, name: 'BPC Deficiente', keywords: 'deficiente, autismo, pcd, baixa renda, deficiência', rules: 'Pessoas com deficiência e baixa renda.', urgent: false },
            { id: 3, name: 'Incapacidade', keywords: 'doença, acidente, afastado, perícia, cirurgia, inss negou', rules: 'Auxílio-doença, aposentadoria por invalidez. REQUER ATENDIMENTO PRESENCIAL.', urgent: true },
            { id: 4, name: 'Aposentadoria', keywords: 'tempo de serviço, idade, contribuição, aposentar', rules: 'Aposentadoria por tempo, idade ou especial.', urgent: false },
            { id: 5, name: 'Aposentadoria PcD', keywords: 'aposentadoria deficiente, pcd aposentadoria', rules: 'Aposentadoria para pessoa com deficiência.', urgent: false },
            { id: 6, name: 'Pensão por Morte', keywords: 'faleceu, viúva, pensão, morte, óbito', rules: 'Dependentes de segurado falecido.', urgent: false },
            { id: 7, name: 'Adicional 25%', keywords: 'cuidador, acamado, precisa de ajuda, aposentado doente', rules: 'Aposentados que precisam de acompanhante permanente.', urgent: false },
            { id: 8, name: 'Trabalhista', keywords: 'demitido, CLT, patrão, horas extras, justa causa, rescisão', rules: 'Questões trabalhistas em geral.', urgent: false },
            { id: 9, name: 'Consumidor', keywords: 'banco, nome sujo, cobrança, plano de saúde, voo', rules: 'Direito do consumidor.', urgent: false }
        ])
    },
    {
        key: 'PROMPT_SISTEMA',
        value: ''
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
