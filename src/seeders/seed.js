require('dotenv').config({ path: __dirname + '/../../.env' });
const sequelize = require('../config/database');
const BotConfig = require('../models/botConfig');
const User = require('../models/user');
const bcrypt = require('bcryptjs');

const initialConfigs = [
    {
        key: 'AVISO_ETICO',
        value: 'Olá! Você entrou em contato com a Advocacia Camila Moura. ⚖️\n\nMeu nome é Carol e estou aqui para direcionar seu atendimento da melhor forma!\n\nInformo que este canal utiliza IA para triagem inicial. Suas informações serão analisadas pela Dra. Camila e equipe jurídica em até 48h úteis.\n\nPara começarmos, qual é o seu nome?'
    },
    {
        key: 'MSG_ADVOGADO_EXISTENTE',
        value: 'Entendemos. Como você já possui advogado constituído, por ética profissional da OAB, não podemos prosseguir com o atendimento consultivo por aqui. Recomendamos que contate seu advogado atual. \n\nAtendimento encerrado.'
    },
    {
        key: 'MSG_PRESENCIAL',
        value: 'Identifiquei que seu caso pode ter urgência ou prazos curtos. 🚨\n\nRecomendamos fortemente que você agende uma visita presencial ou ligue imediatamente para nosso escritório no número (XX) XXXXX-XXXX.'
    },
    {
        key: 'TRELLO_LIST_ID',
        value: '' // Preencher com ID da Lista 'Triagem' se souber, senão o código tenta fallback
    },
    {
        key: 'TRELLO_LABEL_URGENTE_ID',
        value: ''
    },
    {
        key: 'PROMPT_SISTEMA_BASE',
        value: `Você é uma Assistente Jurídica Senior do escritório da Dra. Camila.
Sua função NÃO é dar conselhos legais, mas sim TRIAR e CLASSIFICAR o relato do cliente.
Analise o relato e extraia as informações no formato JSON.`
    },
    {
        key: 'SPECIALTIES_JSON',
        value: JSON.stringify([
            {
                id: 1,
                name: 'BPC/LOAS',
                keywords: 'idoso, deficiente, loas, bpc, baixa renda, 65 anos',
                rules: 'Idosos > 65 anos ou Deficientes. Renda familiar de até 1/4 do salário mínimo por pessoa.',
                urgent: false
            },
            {
                id: 2,
                name: 'Auxílio Doença / Incapacidade',
                keywords: 'doença, acidente, encosto, inss, afastamento, cirurgia',
                rules: 'Qualquer relato de problema de saúde que impeça o trabalho. URGÊNCIA ALTA.',
                urgent: true
            },
            {
                id: 3,
                name: 'Aposentadoria',
                keywords: 'tempo de serviço, idade, contribuição, carteira',
                rules: 'Análise de tempo de contribuição ou idade.',
                urgent: false
            }
        ])
    },
    {
        key: 'PROMPT_SISTEMA',
        value: `Você é Carol, assistente virtual da Advocacia Camila Moura, especializada em Direito Previdenciário, Trabalhista e Consumidor.

SUA MISSÃO: Triagem humanizada e coleta de informações essenciais para a Dra. Camila e equipe jurídica.

REGRAS DE OURO:
1. NUNCA mencione valores, honorários ou garanta resultados.
2. NUNCA use listas numeradas ou menus robotizados.
3. Use tom empático e acolhedor. Valide emoções.
4. UMA pergunta por vez.
5. Referencie sempre "Dra. Camila e equipe jurídica".

FLUXO:
- Verificação Ética: Perguntar se já tem advogado. Se sim, encerrar.
- Identificação da Área: Previdenciário, Trabalhista ou Consumidor.
- Coleta Específica:
  - Previdenciário: SEMPRE peça o CNIS primeiro (orientar via Meu INSS). Perguntar sobre benefício atual/novo/negado.
  - Trabalhista: Situação atual (trabalhando/saiu/afastado) + Narrativa livre do problema.
  - Consumidor: Empresa envolvida, data, tentativa de resolução.
- Documentos: Pedir lista por área (RG/CPF, Comprovante Residência + específicos).
- Encerramento: Cidade/Estado, Urgência e Resumo Final.

RESPOSTA FINAL DA TRIAGEM:
Quando terminar, responda exatamente com [TRIAGEM COMPLETA] e apresente o resumo para o cliente.

SAÍDA FORMATO JSON (SEMPRE):
{
  "client_name": "Nome",
  "type": "Categoria",
  "urgency": "Alta/Baixa",
  "summary": "Resumo do caso",
  "is_complete": true
}`
    }
];

async function seed() {
    try {
        await sequelize.authenticate();
        await sequelize.sync({ alter: true });

        for (const config of initialConfigs) {
            const [item, created] = await BotConfig.findOrCreate({
                where: { key: config.key },
                defaults: config
            });
            if (!created) {
                // Update value if exists to match new new rules
                item.value = config.value;
                await item.save();
                console.log(`Config ${config.key} updated.`);
            } else {
                console.log(`Config ${config.key} created.`);
            }
        }

        // Seed Admin (Check if exists first)
        // ... existing admin code ...
        console.log('Seeding completed successfully.');
        process.exit(0);
    } catch (error) {
        console.error('Seeding failed:', error);
        process.exit(1);
    }
}

seed();
