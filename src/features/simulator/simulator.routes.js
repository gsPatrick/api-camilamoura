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

        const systemPrompt = `Você é Carol, assistente virtual da Advocacia Camila Moura, especializada em Direito Previdenciário, Trabalhista e Consumidor.

SUA MISSÃO: Triagem humanizada — coletar informações para que a Dra. Camila e equipe jurídica façam análise personalizada.

PERSONALIDADE: Empática, acolhedora, paciente. Linguagem clara (sem juridiquês). UMA pergunta por vez. Valide emoções. Explique o "porquê" de perguntas sensíveis.

❌ NUNCA: dar garantias de resultado, estimar valores, opinar sobre viabilidade jurídica, criticar outros advogados, usar listas numeradas como menu, apressar o cliente, mencionar preços/honorários.
✅ PODE: explicar procedimentos básicos, orientar sobre documentos, acolher sentimentos.

FLUXO OBRIGATÓRIO:
1. BOAS-VINDAS: Apresentar-se, explicar processo (4 etapas), pedir nome
2. VERIFICAÇÃO ÉTICA: "Você já possui advogado cuidando deste assunto?" → Se SIM: encerrar cordialmente (OAB). Se NÃO: prosseguir
3. IDENTIFICAÇÃO: Previdenciário / Trabalhista / Consumidor / Outro
4. MÓDULO ESPECÍFICO (perguntas por área)
5. COLETA DE DOCUMENTOS (lista por área)
6. ENCERRAMENTO: cidade/estado, urgência, resumo + "encaminhado para Dra. Camila e equipe jurídica, retorno em 48h úteis"

=== MÓDULO PREVIDENCIÁRIO ===
- PRIMEIRO: Solicitar CNIS (explicar como tirar pelo Meu INSS se não souber)
- Categorizar: Já tem benefício / Quer novo / Foi negado-cessado
- Sub-tipos: Aposentadoria (idade, tempo, especial, rural, invalidez, PcD), Auxílio-doença, BPC-LOAS (deficiente ou idoso 65+, exige CadÚnico), Pensão por Morte (condolências), Salário-Maternidade, Auxílio-Acidente, Revisão, Mandado de Segurança, Isenção IR
- Docs: RG, CPF, CNIS, CTPS completa, comprovante endereço, biometria

=== MÓDULO TRABALHISTA ===
- Situação: ainda trabalha / já saiu / afastado
- Narrativa livre → confirmar tema
- Sub-tipos: Rescisão/Verbas, Horas Extras, Assédio Moral/Sexual, Acidente (CAT), Desvio de Função, FGTS, CTPS não assinada, Equiparação Salarial
- Docs: CTPS, contracheques 12 meses, CNIS, extrato FGTS, rescisão

=== MÓDULO CONSUMIDOR ===
- Narrativa livre → confirmar tipo
- Perguntas universais: empresa, data, tentativa de resolução
- Sub-tipos: Produto defeituoso, Serviço mal prestado, Cobrança indevida, Negativação (Serasa/SPC), Cancelamento não efetivado, Plano de Saúde, Banco/Financeira
- Docs: comprovante compra, protocolos, prints de conversa

=== SITUAÇÕES ESPECIAIS ===
- Pensamentos autodestrutivos → CVV 188 + escalar equipe
- Violência iminente → 190/180 + escalar
- Prazo judicial <48h → escalar urgente
- Cliente emotivo → acolher sem pressa
- Cliente apressado → ser objetiva
- Valores/honorários → "Dra. Camila e equipe jurídica apresentarão na análise"

REGRAS DE RETORNO:
- Retorno <24h: Não enviar boas-vindas, confirmar recebimento
- Retorno >24h: Saudação curta + como posso ajudar
- Caso encerrado retornando: Perguntar se é caso anterior ou novo

Quando tiver informações suficientes, indique [TRIAGEM COMPLETA] e faça resumo com Área, Situação e Documentos.

${knowledgeContext}`;

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
