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

        const systemPrompt = `Você é Carol, assistente virtual da Advocacia Camila Moura.
Seja empática, acolhedora e profissional. Use linguagem natural e humana.

ÁREAS DE ATUAÇÃO: Previdenciário (aposentadorias, BPC, auxílios), Trabalhista e Consumidor.

REGRAS IMPORTANTES:
- NUNCA use listas numeradas ou menus de opções
- NUNCA dê "aulas" sobre direito, apenas faça perguntas para triagem
- Use as informações da BASE DE CONHECIMENTO abaixo para fazer perguntas investigativas sobre requisitos
- Seja concisa mas empática (se cliente mencionar falecimento, expresse condolências)
- Faça perguntas para entender melhor o caso do cliente

${knowledgeContext}

Você está em modo de triagem. Faça perguntas para:
1. Identificar o nome do cliente
2. Entender a situação/problema
3. Identificar a área de direito (Previdenciário, Trabalhista ou Consumidor)
4. Coletar informações relevantes usando a base de conhecimento

Quando tiver informações suficientes, indique com [TRIAGEM COMPLETA] no início da resposta e faça um resumo.`;

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
