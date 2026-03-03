require('dotenv').config();
const http = require('http');
const app = require('./app');
const sequelize = require('./src/config/database');

const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

console.log('🚀 Sistema Advocacia Camila Moura - Iniciando...');

const UserService = require('./src/features/user/user.service');
const BotConfig = require('./src/models/botConfig');
const KnowledgeBase = require('./src/models/knowledgeBase');
const FlowConfig = require('./src/models/flowConfig');
const FlowQuestion = require('./src/models/flowQuestion');

// Default configurations for the bot
const DEFAULT_CONFIGS = [
    {
        key: 'AVISO_ETICO',
        value: 'Olá! Você entrou em contato com a Advocacia Camila Moura. ⚖️\n\nSomos especialistas em Direito Previdenciário, com expertise em Trabalhista e Consumidor.\n\nMeu nome é Carol e estou aqui para direcionar seu atendimento da melhor forma!\n\nNosso horário de atendimento:\nSegunda a sexta-feira, das 09h às 18h (dias úteis)\n\nAntes de começarmos, deixa eu te explicar como funciona nosso atendimento:\n1️⃣ Vou fazer algumas perguntas para entender sua situação\n2️⃣ Vou pedir documentos importantes (você pode enviar depois se não tiver agora)\n3️⃣ Nossa equipe jurídica vai analisar tudo com atenção\n4️⃣ Em até 48h úteis você recebe o retorno com avaliação completa do seu caso\n\nTodo atendimento é personalizado porque cada caso é único!\n\nPara começarmos, qual é o seu nome?'
    },
    {
        key: 'MSG_ADVOGADO_EXISTENTE',
        value: 'Agradeço muito pelo contato! ⚖️\n\nPor questão de ética profissional (OAB), não podemos atender demandas que já estão sob cuidado de outro advogado.\n\nMas ficamos totalmente à disposição caso você precise de orientação sobre qualquer outro assunto no futuro!\n\nDesejamos sucesso no seu processo!\n\nAtendimento encerrado.'
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
    },
    {
        key: 'CNIS_INSTRUCTIONS',
        value: 'COMO EMITIR O CNIS EM PDF PELO MEU INSS:\n\n1️⃣ Acesse o Meu INSS (meu.inss.gov.br ou App).\n2️⃣ Faça login com sua conta Gov.br.\n3️⃣ Vá até "Extratos e Comprovantes".\n4️⃣ Escolha "Extrato de Contribuições (CNIS)".\n5️⃣ Role até o final e clique em "Baixar Documento".\n6️⃣ Selecione "Vínculos, contribuições e remunerações".\n7️⃣ Salve o arquivo em PDF.\n\nQuando conseguir, me envia! Sem ele, a Dra. Camila e equipe jurídica não conseguem analisar seu caso.'
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
