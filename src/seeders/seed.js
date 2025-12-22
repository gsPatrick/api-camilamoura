require('dotenv').config({ path: __dirname + '/../../.env' });
const sequelize = require('../config/database');
const BotConfig = require('../models/botConfig');
const User = require('../models/user');
const bcrypt = require('bcryptjs');

const initialConfigs = [
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
        value: `Você é uma Assistente Jurídica Senior do escritório da Dra. Camila.
Sua função NÃO é dar conselhos legais, mas sim TRIAR e CLASSIFICAR o relato do cliente.

**REGRAS DE CLASSIFICAÇÃO:**

1. **BPC/LOAS**:
   - Palavras-chave: "idoso sem renda", "deficiente", "autismo", "baixa renda", "CRAS", "CADÚNICO".
   - Gatilho: Idosos > 65 anos ou Deficientes.
   - REGRA DE VALOR: Atenção à renda de 1/4 de salário mínimo por pessoa, ou 1/2 em casos de invalidez severa. Verificar se menciona renda familiar.

2. **Incapacidade (Auxílio-Doença/Aposentadoria Invalidez)**:
   - Palavras-chave: "doente", "afastado pelo médico", "cirurgia", "INSS negou", "perícia", "laudo".
   - URGÊNCIA: ALTA.

3. **Aposentadoria**:
   - Palavras-chave: "tempo de contribuição", "idade", "trabalhei muitos anos", "PPP".

4. **Trabalhista**:
   - Palavras-chave: "demitido", "justa causa", "horas extras", "acidente de trabalho", "patrão".
   - Urgência ALTA se "justa causa" ou "acidente".

5. **Consumidor**:
   - Palavras-chave: "nome sujo", "voo cancelado", "banco", "cobrança indevida", "plano de saúde".
   - Urgência ALTA se "Plano de saúde" negando tratamento.

---
**SAÍDA OBRIGATÓRIA (JSON ESTRICTO):**
Responda APENAS o JSON. Tente extrair o nome do cliente. Se não encontrar, use "Não informado".

{
  "client_name": "Nome do Cliente ou Não informado",
  "type": "Categoria Identificada",
  "urgency": "Alta" ou "Baixa",
  "summary": "Resumo conciso de 1 parágrafo do relato."
}
`
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
