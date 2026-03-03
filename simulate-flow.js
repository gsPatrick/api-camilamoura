require('dotenv').config();
const sequelize = require('./src/config/database');
const automationService = require('./src/features/automation/automation.service');
const Conversation = require('./src/models/conversation');
const BotConfig = require('./src/models/botConfig');

const { openaiClient } = require('./src/config/apiClients');

// --- MOCK Z-API ---
// Monkey-patch para não enviar mensagens reais, mas logar
automationService.sendWhatsappMessage = async (phone, msg) => {
    console.log(`\n📢 [Simulação WhatsApp] Enviando para ${phone}:`);
    console.log(`   "${msg}"`);
};

// --- MOCK OPENAI (HARDCODED) ---
openaiClient.post = async () => {
    console.log('🤖 [Simulação AI] Retornando classificação hardcoded...');
    return {
        data: {
            choices: [{
                message: {
                    content: JSON.stringify({
                        type: "Incapacidade",
                        urgency: "High",
                        summary: "Cliente incapacitado por acidente de trânsito, perna quebrada, urgência alta devido à negação do INSS"
                    })
                }
            }]
        }
    };
};

async function simulateFlow() {
    const TEST_PHONE = '5511999990007'; // Dummy Validated 7
    const TEST_MESSAGE = "Sofri um acidente grave de carro semana passada, quebrei a perna em dois lugares e o médico disse que vou ficar 6 meses sem trabalhar. O INSS negou meu pedido e estou desesperado.";

    console.log('🚀 Iniciando Simulação de Test-Drive...');
    console.log('--------------------------------------');

    try {
        await sequelize.authenticate();
        console.log('✅ Banco de Dados Conectado.');
        await sequelize.sync(); // Garante que tabelas existem


        // 1. Limpar estado anterior do teste
        await Conversation.destroy({ where: { phone: TEST_PHONE } });

        // 2. Criar estado "Esperando Resposta" (Simula que o cliente já recebeu o Aviso Ético)
        await Conversation.create({
            phone: TEST_PHONE,
            step: 'WAITING_FOR_INPUT'
        });
        console.log(`✅ Estado Inicial Configurado: WAITING_FOR_INPUT para ${TEST_PHONE}`);

        // 3. Garantir Configuração de Lista (Fallback)
        // Se TRELLO_LIST_ID não estiver no banco, o código tentará o fallback.
        // Vamos logar o que temos.
        const listConfig = await BotConfig.findOne({ where: { key: 'TRELLO_LIST_ID' } });
        console.log(`ℹ️ Config Lista Trello: ${listConfig ? listConfig.value : 'Não configurado (Usará Fallback)'}`);

        // 4. Disparar Webhook Simulado
        const mockWebhook = {
            phone: TEST_PHONE,
            fromMe: false,
            text: { message: TEST_MESSAGE }
        };

        console.log('\n🔄 Recebendo Webhook Simulado (Relato do Cliente)...');
        console.log(`   "${TEST_MESSAGE}"`);

        // Inicia o processamento real
        const startTime = Date.now();
        await automationService.processWebhook(mockWebhook);

        console.log('\n--------------------------------------');
        console.log(`✅ Processamento Concluído em ${(Date.now() - startTime) / 1000}s`);
        console.log('👉 Verifique seu Trello (Lista de Triagem/Entrada) para confirmar o Card!');

    } catch (error) {
        console.error('❌ Erro na Simulação:', error);
    } finally {
        await sequelize.close();
    }
}

simulateFlow();
