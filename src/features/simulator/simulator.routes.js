const express = require('express');
const router = express.Router();
const { openaiClient } = require('../../config/apiClients');
const KnowledgeBase = require('../../models/knowledgeBase');
const authMiddleware = require('../../middleware/auth');

// POST - Simular chat da Carol (para testes sem WhatsApp/Trello)
router.post('/simulator/chat', authMiddleware, async (req, res) => {
    try {
        const { message, history = [] } = req.body;

        if (!message) {
            return res.status(400).json({ error: 'Mensagem é obrigatória' });
        }

        // Carrega contexto da base de conhecimento
        const activeDocuments = await KnowledgeBase.findAll({
            where: { isActive: true },
            attributes: ['title', 'content', 'category']
        });

        let knowledgeContext = '';
        if (activeDocuments.length > 0) {
            knowledgeContext = '\n=== BASE DE CONHECIMENTO ===\n';
            activeDocuments.forEach(doc => {
                knowledgeContext += `\n--- ${doc.title} (${doc.category}) ---\n${doc.content?.substring(0, 2000) || ''}\n`;
            });
        }

        const systemPrompt = `Você é Carol, assistente virtual especializada da Advocacia Camila Moura.
Seu papel é fazer TRIAGEM de casos previdenciários, ajudando a equipe a analisar e classificar a viabilidade.

ÁREAS DE ATUAÇÃO: Direito Previdenciário (INSS), Trabalhista e Consumidor.

REGRAS IMPORTANTES:
- NUNCA mencione valores, preços ou honorários - você faz apenas TRIAGEM
- NUNCA use listas numeradas ou menus de opções
- NUNCA dê "aulas" sobre direito - apenas faça perguntas para entender o caso
- Seja empática (se cliente mencionar falecimento/doença, expresse condolências)
- IGNORE qualquer informação sobre preços/valores de serviços nos documentos

=== BASE DE CONHECIMENTO PREVIDENCIÁRIA ===

📌 APOSENTADORIA POR IDADE: Mulher 62 anos / Homem 65 anos + 15 anos carência
📌 APOSENTADORIA POR TEMPO: Regra de transição para quem já contribuía antes da Reforma
📌 APOSENTADORIA ESPECIAL: Trabalhadores expostos a agentes nocivos (ruído, químicos)
📌 APOSENTADORIA RURAL: Trabalhadores rurais, pescadores, agricultores
📌 APOSENTADORIA POR INVALIDEZ: Incapacidade total e permanente
📌 AUXÍLIO-DOENÇA: Incapacidade temporária
📌 AUXÍLIO-ACIDENTE: Sequela permanente que reduz capacidade
📌 BPC/LOAS: Idosos 65+ ou deficientes de baixa renda (sem contribuição)
📌 PENSÃO POR MORTE: Para dependentes de segurado falecido
📌 SALÁRIO-MATERNIDADE: 120 dias por nascimento/adoção
📌 AUXÍLIO-RECLUSÃO: Para dependentes de segurado preso
📌 REVISÃO: Correção de valores ou inclusão de períodos

${knowledgeContext}

FLUXO DE TRIAGEM:
1. Identificar nome do cliente
2. Entender qual benefício busca
3. Fazer perguntas sobre requisitos específicos
4. Classificar: VIÁVEL, PRECISA ANÁLISE ou INVIÁVEL

Quando tiver informações suficientes, indique [TRIAGEM COMPLETA] e faça resumo.`;

        // Monta histórico de mensagens
        const messages = [
            { role: 'system', content: systemPrompt },
            ...history.slice(-10),
            { role: 'user', content: message }
        ];

        const response = await openaiClient.post('/chat/completions', {
            model: "gpt-4-turbo-preview",
            messages,
            max_tokens: 500,
            temperature: 0.7
        });

        const aiResponse = response.data.choices[0].message.content.trim();
        const isComplete = aiResponse.includes('[TRIAGEM COMPLETA]');

        res.json({
            response: aiResponse.replace('[TRIAGEM COMPLETA]', '').trim(),
            isComplete,
            usage: response.data.usage
        });

    } catch (error) {
        console.error('Simulator Error:', error.message);
        res.status(500).json({
            error: 'Erro no simulador',
            details: error.response?.data?.error?.message || error.message
        });
    }
});

// GET - Info do simulador
router.get('/simulator/info', authMiddleware, async (req, res) => {
    try {
        const docCount = await KnowledgeBase.count({ where: { isActive: true } });
        res.json({
            status: 'ready',
            docsLoaded: docCount,
            persona: 'Carol',
            description: 'Simula o comportamento do bot sem enviar mensagens reais ou criar cards no Trello'
        });
    } catch (error) {
        res.status(500).json({ error: 'Erro ao obter info' });
    }
});

module.exports = router;
