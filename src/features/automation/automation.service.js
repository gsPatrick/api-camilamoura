const { zapiClient, trelloClient, openaiClient } = require('../../config/apiClients');
const BotConfig = require('../../models/botConfig');
const Conversation = require('../../models/conversation');
const FlowConfig = require('../../models/flowConfig');
const FlowQuestion = require('../../models/flowQuestion');
const KnowledgeBase = require('../../models/knowledgeBase');
const boardId = process.env.TRELLO_BOARD_ID;

class AutomationService {
    async processWebhook(webhookData) {
        if (!webhookData || !webhookData.phone) return;
        if (webhookData.fromMe) return;

        const phone = webhookData.phone;
        let message = '';

        // Suporte a mensagens de texto
        if (webhookData.text && webhookData.text.message) {
            message = webhookData.text.message;
        }

        // Suporte a mensagens de áudio - transcrição com Whisper
        if (webhookData.audio && webhookData.audio.audioUrl) {
            console.log(`[Audio] Recebido áudio de ${phone}, transcrevendo...`);
            try {
                message = await this.transcribeAudio(webhookData.audio.audioUrl);
                console.log(`[Audio] Transcrição: ${message.substring(0, 100)}...`);
            } catch (err) {
                console.error('[Audio] Erro na transcrição:', err.message);
                // Envia mensagem pedindo texto se falhar a transcrição
                await this.sendWhatsappMessage(phone, 'Desculpe, não consegui ouvir seu áudio. Pode digitar sua mensagem, por favor?');
                return;
            }
        }

        if (!message) return;

        try {
            // 1. Verifica se já existe Card no Trello (Cliente Antigo)
            const existingCard = await this.findTrelloCard(phone);
            if (existingCard) {
                console.log(`[Trello] Card encontrado para ${phone}. Adicionando comentário.`);
                await this.addCommentToCard(existingCard.id, `Nova mensagem do cliente:\n${message}`);
                return;
            }

            // 2. Fluxo de Novo Lead (baseado na configuração)
            await this.handleLeadFlow(phone, message);

        } catch (error) {
            console.error('Error processing webhook:', error);
        }
    }

    // ==================== FLUXO PRINCIPAL - DINÂMICO ====================
    async handleLeadFlow(phone, message) {
        // Carrega configuração de fluxo ativa
        let flowConfig = await FlowConfig.findOne({ where: { isActive: true } });
        if (!flowConfig) {
            flowConfig = await FlowConfig.create({});
        }

        let conversation = await Conversation.findOne({ where: { phone } });

        // ====== PRIMEIRA INTERAÇÃO - Envia Aviso Ético ======
        if (!conversation) {
            console.log(`[Flow] Novo contato: ${phone}. Modo: ${flowConfig.mode}`);

            const avisoEtico = await BotConfig.findOne({ where: { key: 'AVISO_ETICO' } });
            const text = avisoEtico ? avisoEtico.value :
                'Olá! Você entrou em contato com o escritório da Dra. Camila Moura. ⚖️\n\nAtuamos nas áreas de Direito Previdenciário, Trabalhista e do Consumidor.';

            await this.sendWhatsappMessage(phone, text);

            // Cria conversa e avança baseado no modo
            conversation = await Conversation.create({
                phone,
                step: 'INITIAL',
                responses: {},
                messageHistory: [],
                currentQuestionIndex: 0,
                aiQuestionCount: 0
            });

            // Envia primeira pergunta baseado no modo
            await this.sendNextQuestion(conversation, flowConfig, message);
            return;
        }

        // ====== CONVERSA EM ANDAMENTO ======

        // Adiciona mensagem ao histórico
        const history = conversation.messageHistory || [];
        history.push({ role: 'user', content: message });
        conversation.messageHistory = history;

        // Se está no modo AI_CHAT (pós-triagem com IA respondendo)
        if (conversation.step === 'AI_CHAT') {
            await this.handleAIChat(conversation, flowConfig, message);
            return;
        }

        // Processa resposta e continua fluxo
        await this.processResponse(conversation, flowConfig, message);
    }

    // ==================== ENVIA PRÓXIMA PERGUNTA ====================
    async sendNextQuestion(conversation, flowConfig, previousMessage) {
        const mode = flowConfig.mode;

        if (mode === 'MANUAL') {
            // Modo Manual: Perguntas fixas definidas pela advogada
            const questions = await FlowQuestion.findAll({
                where: { flowConfigId: flowConfig.id },
                order: [['order', 'ASC']]
            });

            if (questions.length === 0) {
                // Fallback: Se não tem perguntas configuradas, pede nome e relato
                await this.sendWhatsappMessage(conversation.phone, "Qual é o seu nome completo? 📝");
                conversation.step = 'COLLECTING';
                conversation.currentQuestionIndex = -1; // Indica fallback
                await conversation.save();
                return;
            }

            const currentIndex = conversation.currentQuestionIndex;
            if (currentIndex < questions.length) {
                await this.sendWhatsappMessage(conversation.phone, questions[currentIndex].question);
                conversation.step = 'COLLECTING';
                await conversation.save();
            }

        } else if (mode === 'AI_FIXED' || mode === 'AI_DYNAMIC') {
            // Modos IA: Primeira pergunta sempre pede relato
            await this.sendWhatsappMessage(conversation.phone,
                "Para que possamos entender melhor seu caso, por favor, descreva detalhadamente sua situação. 📝");
            conversation.step = 'COLLECTING';
            await conversation.save();
        }
    }

    // ==================== PROCESSA RESPOSTA ====================
    async processResponse(conversation, flowConfig, message) {
        const mode = flowConfig.mode;
        const phone = conversation.phone;

        if (mode === 'MANUAL') {
            await this.processManualModeResponse(conversation, flowConfig, message);
        } else if (mode === 'AI_FIXED') {
            await this.processAIFixedResponse(conversation, flowConfig, message);
        } else if (mode === 'AI_DYNAMIC') {
            await this.processAIDynamicResponse(conversation, flowConfig, message);
        }
    }

    // ==================== MODO MANUAL ====================
    async processManualModeResponse(conversation, flowConfig, message) {
        const questions = await FlowQuestion.findAll({
            where: { flowConfigId: flowConfig.id },
            order: [['order', 'ASC']]
        });

        const currentIndex = conversation.currentQuestionIndex;

        // Fallback se não tem perguntas configuradas
        if (questions.length === 0 || currentIndex === -1) {
            // Primeira resposta = nome
            if (!conversation.clientName) {
                let clientName = message.trim().replace(/[^a-zA-ZÀ-ÿ\s]/g, '').substring(0, 100);
                clientName = clientName.split(' ').map(word =>
                    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
                ).join(' ');

                conversation.clientName = clientName;
                conversation.currentQuestionIndex = -2;
                await conversation.save();

                await this.sendWhatsappMessage(conversation.phone,
                    `Prazer, ${clientName.split(' ')[0]}! 😊\n\nDescreva brevemente sua situação.`);
                return;
            }

            // Segunda resposta = caso
            await this.finalizeTriage(conversation, flowConfig, message);
            return;
        }

        // Salva resposta da pergunta atual
        const responses = conversation.responses || {};
        const currentQuestion = questions[currentIndex];

        if (currentQuestion) {
            // Se é a pergunta de nome, salva no clientName também
            if (currentQuestion.variableName === 'nome') {
                let clientName = message.trim().replace(/[^a-zA-ZÀ-ÿ\s]/g, '').substring(0, 100);
                conversation.clientName = clientName.split(' ').map(word =>
                    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
                ).join(' ');
            }

            responses[currentQuestion.variableName] = message;
            conversation.responses = responses;
        }

        // Avança para próxima pergunta
        const nextIndex = currentIndex + 1;

        if (nextIndex < questions.length) {
            // Ainda tem perguntas
            conversation.currentQuestionIndex = nextIndex;
            await conversation.save();

            const nextQuestion = questions[nextIndex];
            await this.sendWhatsappMessage(conversation.phone, nextQuestion.question);
        } else {
            // Todas perguntas respondidas - finaliza triagem
            await this.finalizeTriage(conversation, flowConfig, message);
        }
    }

    // ==================== MODO IA COM QUANTIDADE FIXA ====================
    async processAIFixedResponse(conversation, flowConfig, message) {
        const maxQuestions = flowConfig.aiQuestionCount || 3;
        const questionsAsked = conversation.aiQuestionCount || 0;

        // Primeira resposta = relato inicial
        if (questionsAsked === 0) {
            // Extrai nome automaticamente se possível
            const extractedName = await this.extractNameFromMessage(message);
            if (extractedName && !conversation.clientName) {
                conversation.clientName = extractedName;
            }

            // Salva relato
            const responses = conversation.responses || {};
            responses.relato = message;
            conversation.responses = responses;
        }

        conversation.aiQuestionCount = questionsAsked + 1;

        // Se ainda pode fazer perguntas
        if (questionsAsked < maxQuestions) {
            const followUpQuestion = await this.generateAIFollowUp(conversation, maxQuestions - questionsAsked);

            if (followUpQuestion && followUpQuestion !== 'SUFFICIENT') {
                // Adiciona ao histórico
                const history = conversation.messageHistory || [];
                history.push({ role: 'assistant', content: followUpQuestion });
                conversation.messageHistory = history;

                await conversation.save();
                await this.sendWhatsappMessage(conversation.phone, followUpQuestion);
                return;
            }
        }

        // Atingiu limite ou tem info suficiente
        await this.finalizeTriage(conversation, flowConfig, message);
    }

    // ==================== MODO IA DINÂMICO ====================
    async processAIDynamicResponse(conversation, flowConfig, message) {
        const maxQuestions = flowConfig.aiMaxQuestions || 5;
        const questionsAsked = conversation.aiQuestionCount || 0;

        // Primeira resposta = relato inicial
        if (questionsAsked === 0) {
            const extractedName = await this.extractNameFromMessage(message);
            if (extractedName && !conversation.clientName) {
                conversation.clientName = extractedName;
            }

            const responses = conversation.responses || {};
            responses.relato = message;
            conversation.responses = responses;
        }

        conversation.aiQuestionCount = questionsAsked + 1;

        // Verifica se IA tem info suficiente ou precisa de mais
        if (questionsAsked < maxQuestions) {
            const result = await this.evaluateAndGenerateFollowUp(conversation);

            if (result.needsMoreInfo && result.question) {
                // Adiciona ao histórico
                const history = conversation.messageHistory || [];
                history.push({ role: 'assistant', content: result.question });
                conversation.messageHistory = history;

                await conversation.save();
                await this.sendWhatsappMessage(conversation.phone, result.question);
                return;
            }
        }

        // Tem info suficiente ou atingiu limite
        await this.finalizeTriage(conversation, flowConfig, message);
    }

    // ==================== GERA PERGUNTA DE FOLLOW-UP (IA FIXA) ====================
    async generateAIFollowUp(conversation, remainingQuestions) {
        const history = conversation.messageHistory || [];
        const responses = conversation.responses || {};

        // Carrega contexto da base de conhecimento
        const knowledgeContext = await this.getKnowledgeContext();

        const systemPrompt = `Você é Carol, assistente virtual da Advocacia Camila Moura.
Seja empática, acolhedora e profissional. Use linguagem natural e humana.

ÁREAS DE ATUAÇÃO: Previdenciário (aposentadorias, BPC, auxílios), Trabalhista e Consumidor.

REGRAS IMPORTANTES:
- NUNCA use listas numeradas ou menus de opções
- NUNCA dê "aulas" sobre direito, apenas faça perguntas para triagem
- Use as informações da BASE DE CONHECIMENTO abaixo para fazer perguntas investigativas sobre requisitos
- Seja concisa mas empática (se cliente mencionar falecimento, expresse condolências)

${knowledgeContext}

Você pode fazer mais ${remainingQuestions} pergunta(s) para completar a triagem.
Faça perguntas objetivas e focadas para extrair informações essenciais do caso.

Se perceber alguma das situações abaixo, responda APENAS "ENCERRAR|motivo":
- Cliente já tem advogado: "ENCERRAR|has_lawyer"
- Assunto fora da área (criminal, família, divórcio): "ENCERRAR|outside_area"

Se já tiver informação suficiente, responda: "SUFFICIENT"

Caso contrário, faça UMA pergunta objetiva e acolhedora.`;

        try {
            const messages = [
                { role: 'system', content: systemPrompt },
                ...history.slice(-6), // Últimas 6 mensagens de contexto
            ];

            const response = await openaiClient.post('/chat/completions', {
                model: "gpt-4-turbo-preview",
                messages,
                max_tokens: 200,
                temperature: 0.7
            });

            return response.data.choices[0].message.content.trim();
        } catch (error) {
            console.error('OpenAI Follow-up Error:', error.message);
            return 'SUFFICIENT';
        }
    }

    // ==================== AVALIA E GERA FOLLOW-UP (IA DINÂMICA) ====================
    async evaluateAndGenerateFollowUp(conversation) {
        const history = conversation.messageHistory || [];
        const knowledgeContext = await this.getKnowledgeContext();

        const systemPrompt = `Você é Carol, assistente virtual da Advocacia Camila Moura.
Seja empática, acolhedora e profissional. Use linguagem natural e humana.

ÁREAS DE ATUAÇÃO: Previdenciário (aposentadorias, BPC, auxílios), Trabalhista e Consumidor.

REGRAS IMPORTANTES:
- NUNCA use listas numeradas ou menus de opções
- NUNCA dê "aulas" sobre direito, apenas faça perguntas para triagem
- Use as informações da BASE DE CONHECIMENTO abaixo para fazer perguntas investigativas sobre requisitos
- Seja concisa mas empática (se cliente mencionar falecimento, expresse condolências)

${knowledgeContext}

Analise a conversa e decida:
1. Se tem INFO SUFICIENTE para triagem (nome, área do direito, situação básica) → responda JSON: {"needsMoreInfo": false}
2. Se precisa de MAIS INFO → responda JSON: {"needsMoreInfo": true, "question": "Pergunta objetiva aqui"}

Se detectar que cliente já tem advogado ou assunto está fora da área, inclua: {"shouldClose": true, "closeReason": "has_lawyer" ou "outside_area"}

Seja eficiente - não prolongue desnecessariamente. Máximo 5-7 perguntas no total.`;

        try {
            const messages = [
                { role: 'system', content: systemPrompt },
                ...history.slice(-8),
            ];

            const response = await openaiClient.post('/chat/completions', {
                model: "gpt-4-turbo-preview",
                messages,
                response_format: { type: "json_object" },
                max_tokens: 300,
                temperature: 0.5
            });

            return JSON.parse(response.data.choices[0].message.content);
        } catch (error) {
            console.error('OpenAI Evaluate Error:', error.message);
            return { needsMoreInfo: false };
        }
    }

    // ==================== FINALIZA TRIAGEM ====================
    async finalizeTriage(conversation, flowConfig, lastMessage) {
        const phone = conversation.phone;
        const responses = conversation.responses || {};
        const history = conversation.messageHistory || [];

        // Mensagem de processamento
        await this.sendWhatsappMessage(phone, "Recebemos suas informações! Estamos analisando seu caso... ⏳");

        // Monta relato completo para IA classificar
        let fullContext = '';
        for (const [key, value] of Object.entries(responses)) {
            fullContext += `${key}: ${value}\n`;
        }
        fullContext += `\nÚltima mensagem: ${lastMessage}`;

        // Classificação com IA
        const classification = await this.classifyCase(fullContext);

        // Nome do cliente
        const clientName = conversation.clientName || classification.client_name || phone;

        // Atualiza responses com classificação
        responses.area = classification.type;
        responses.resumo = classification.summary;
        responses.urgencia = classification.urgency;
        conversation.responses = responses;

        // Verifica encerramento automático
        if (classification.should_close) {
            const closeMsg = await this.getCloseMessage(classification.close_reason);
            await this.sendWhatsappMessage(phone, closeMsg);
            await conversation.destroy();
            return;
        }

        // Verifica atendimento presencial
        const requiresInPerson = this.requiresInPersonAttendance(classification);
        if (requiresInPerson) {
            const msgPresencial = await BotConfig.findOne({ where: { key: 'MSG_PRESENCIAL' } });
            const presencialText = msgPresencial?.value ||
                'Identificamos que seu caso requer atendimento presencial inicial.';
            await this.sendWhatsappMessage(phone, presencialText);
        }

        // Cria Card no Trello com template configurado
        await this.createTrelloCardFromTemplate(phone, classification, responses, flowConfig);

        // Ação pós-triagem
        if (flowConfig.postAction === 'AI_RESPONSE') {
            // Muda para modo de chat com IA
            conversation.step = 'AI_CHAT';
            await conversation.save();

            await this.sendWhatsappMessage(phone,
                `${clientName.split(' ')[0]}, seu caso foi registrado! 📋\n\nSe tiver mais dúvidas, pode perguntar que tentarei ajudar.`);
        } else {
            // WAIT_CONTACT - Encerra
            await conversation.destroy();
            await this.sendWhatsappMessage(phone,
                `${clientName.split(' ')[0]}, seu caso foi encaminhado para nossa equipe jurídica. Entraremos em contato em breve! ✅`);
        }
    }

    // ==================== CHAT COM IA (PÓS-TRIAGEM) ====================
    async handleAIChat(conversation, flowConfig, message) {
        const knowledgeContext = await this.getKnowledgeContext();
        const history = conversation.messageHistory || [];

        const systemPrompt = `Você é Carol, assistente virtual da Advocacia Camila Moura.
Seja empática, acolhedora e profissional. Use linguagem natural e humana.

ÁREAS DE ATUAÇÃO: Previdenciário, Trabalhista e Consumidor.

REGRAS IMPORTANTES:
- NUNCA use listas numeradas ou menus de opções
- Responda de forma conversacional e natural

${knowledgeContext}

O cliente já passou pela triagem inicial. Agora você pode:
- Responder dúvidas gerais sobre processos
- Dar informações sobre documentação necessária
- Explicar como funcionam os procedimentos

NÃO dê parecer jurídico específico ou previsões de resultado.
Seja acolhedora e profissional. Se a dúvida for muito específica, oriente a aguardar o contato da equipe.`;

        try {
            // Adiciona mensagem do usuário
            history.push({ role: 'user', content: message });

            const messages = [
                { role: 'system', content: systemPrompt },
                ...history.slice(-10)
            ];

            const response = await openaiClient.post('/chat/completions', {
                model: "gpt-4-turbo-preview",
                messages,
                max_tokens: 500,
                temperature: 0.7
            });

            const aiResponse = response.data.choices[0].message.content.trim();

            // Adiciona resposta ao histórico
            history.push({ role: 'assistant', content: aiResponse });
            conversation.messageHistory = history;
            await conversation.save();

            await this.sendWhatsappMessage(conversation.phone, aiResponse);

            // Também adiciona como comentário no Trello
            const existingCard = await this.findTrelloCard(conversation.phone);
            if (existingCard) {
                await this.addCommentToCard(existingCard.id,
                    `📱 Chat pós-triagem:\n\nCliente: ${message}\n\nAssistente: ${aiResponse}`);
            }

        } catch (error) {
            console.error('AI Chat Error:', error.message);
            await this.sendWhatsappMessage(conversation.phone,
                'Desculpe, houve um problema. Por favor, aguarde o contato da nossa equipe.');
        }
    }

    // ==================== HELPERS ====================

    async extractNameFromMessage(message) {
        // Tenta extrair nome do início da mensagem
        const match = message.match(/^(?:meu nome é|sou|me chamo|eu sou)?\s*([A-ZÀ-Ÿ][a-zà-ÿ]+(?:\s+[A-ZÀ-Ÿ][a-zà-ÿ]+)*)/i);
        if (match && match[1]) {
            return match[1].trim();
        }
        return null;
    }

    async getKnowledgeContext() {
        try {
            const docs = await KnowledgeBase.findAll({
                where: { isActive: true },
                attributes: ['title', 'content']
            });

            if (docs.length === 0) return '';

            let context = '\n=== BASE DE CONHECIMENTO ===\n';
            docs.forEach(doc => {
                context += `\n--- ${doc.title} ---\n${doc.content?.substring(0, 2000) || ''}\n`;
            });
            return context;
        } catch (e) {
            return '';
        }
    }

    async createTrelloCardFromTemplate(phone, classification, responses, flowConfig) {
        try {
            // Lista de destino
            const configList = await BotConfig.findOne({ where: { key: 'TRELLO_LIST_ID' } });
            let targetListId = configList?.value;

            if (!targetListId) {
                const listsRes = await trelloClient.get(`/boards/${boardId}/lists`);
                const lists = listsRes.data;
                const fallbackList = lists.find(l => /triagem|checklist|novos|entrada/i.test(l.name)) || lists[0];
                if (fallbackList) targetListId = fallbackList.id;
            }

            if (!targetListId) throw new Error('Target List not found');

            // Aplica template do título - padrão: NOME - TELEFONE
            let cardTitle = flowConfig.trelloTitleTemplate || '{nome} - {telefone}';
            let cardDesc = flowConfig.trelloDescTemplate ||
                '**Área:** {area}\n**Telefone:** {telefone}\n**Resumo:** {resumo}';

            // Dados para substituição
            const data = {
                nome: responses.nome || classification.client_name || phone,
                telefone: phone,
                area: classification.type || 'Geral',
                resumo: classification.summary || '',
                urgencia: classification.urgency || 'Normal',
                relato: responses.relato || '',
                ...responses
            };

            // Substitui variáveis
            Object.keys(data).forEach(key => {
                const regex = new RegExp(`\\{${key}\\}`, 'gi');
                cardTitle = cardTitle.replace(regex, data[key] || '');
                cardDesc = cardDesc.replace(regex, data[key] || '');
            });

            // Busca label
            const labelIds = [];
            try {
                const labelsRes = await trelloClient.get(`/boards/${boardId}/labels`);
                const labels = labelsRes.data;
                const matchedLabel = labels.find(l =>
                    l.name && l.name.toLowerCase() === classification.type?.toLowerCase()
                );
                if (matchedLabel) labelIds.push(matchedLabel.id);
            } catch (e) { console.error('Label error:', e.message); }

            // Cria card
            const createdCard = await trelloClient.post('/cards', {
                idList: targetListId,
                name: cardTitle.toUpperCase(),
                desc: cardDesc,
                pos: 'top',
                idLabels: labelIds
            });

            console.log(`[Trello] Card criado: ${createdCard.data.id}`);

        } catch (error) {
            console.error('Trello Create Error:', error);
        }
    }

    // ==================== FUNÇÕES EXISTENTES ====================

    async classifyCase(message) {
        const systemPrompt = `Você é triagista jurídico do escritório da Dra. Camila Moura.
Analise o relato e classifique usando EXATAMENTE uma das categorias abaixo.

**CATEGORIAS DISPONÍVEIS:**

PREVIDENCIÁRIO:
- "Incapacidade" - Auxílio-doença, aposentadoria por invalidez
- "BPC Deficiente" - BPC/LOAS para pessoas com deficiência
- "Aposentadoria" - Por tempo, idade ou especial
- "Aposentadoria PcD" - Para pessoa com deficiência
- "Pensão por Morte" - Dependentes de falecido
- "Adicional 25%" - Aposentados que precisam de cuidador
- "Aux Acidente" - Auxílio-acidente
- "Revisão de Benefício" - Revisão de benefício existente

TRABALHISTA:
- "Reclamação Trabalhista" - Demissão, verbas, horas extras

CONSUMIDOR:
- "Consumidor" - Nome sujo, cobranças, plano de saúde

OUTROS:
- "OUTROS" - Casos fora das categorias

**ENCERRAMENTO (should_close = true):**
- Cliente tem advogado → close_reason: "has_lawyer"
- Assunto fora da área → close_reason: "outside_area"

**RESPONDA APENAS JSON:**
{
  "client_name": "Nome ou null",
  "type": "Categoria",
  "urgency": "Alta" | "Normal",
  "summary": "Resumo objetivo",
  "should_close": false,
  "close_reason": null
}`;

        try {
            const response = await openaiClient.post('/chat/completions', {
                model: "gpt-4-turbo-preview",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: `Relato: "${message}"` }
                ],
                response_format: { type: "json_object" },
                temperature: 0.0
            });
            return JSON.parse(response.data.choices[0].message.content);
        } catch (error) {
            console.error('OpenAI Error:', error.message);
            return {
                client_name: null,
                type: 'Geral',
                urgency: 'Normal',
                summary: message.substring(0, 100),
                should_close: false,
                close_reason: null
            };
        }
    }

    requiresInPersonAttendance(classification) {
        const inPersonKeywords = ['Incapacidade', 'doença', 'acidente', 'perícia'];
        const type = classification.type?.toLowerCase() || '';
        const summary = classification.summary?.toLowerCase() || '';

        if (type === 'incapacidade') return true;
        if (inPersonKeywords.some(kw => summary.includes(kw.toLowerCase()))) return true;
        if (classification.urgency === 'Alta') return true;

        return false;
    }

    async getCloseMessage(reason) {
        switch (reason) {
            case 'has_lawyer':
                const msgAdvogado = await BotConfig.findOne({ where: { key: 'MSG_ADVOGADO_EXISTENTE' } });
                return msgAdvogado?.value ||
                    'Entendemos. Como você já possui advogado constituído, por ética profissional (OAB), não podemos prosseguir.\n\nAtendimento encerrado.';
            case 'outside_area':
                return 'Agradecemos seu contato. Este assunto não está entre as áreas atendidas pelo nosso escritório (Previdenciário, Trabalhista e Consumidor).\n\nRecomendamos buscar um especialista.';
            default:
                return 'Atendimento encerrado. Obrigado pelo contato.';
        }
    }

    async findTrelloCard(phone) {
        try {
            // Busca por telefone em diversos padrões que a cliente pode ter usado:
            // - NOME: NUMERO
            // - NOME - NUMERO  
            // - Apenas NUMERO
            const response = await trelloClient.get(`/search`, {
                params: {
                    query: phone,
                    modelTypes: 'cards',
                    idBoards: boardId,
                    partial: true
                }
            });

            if (response.data?.cards?.length > 0) {
                // Encontra card que contém o número no título
                const matchingCard = response.data.cards.find(card => {
                    const title = card.name || '';
                    // Verifica se o telefone aparece em qualquer padrão
                    return title.includes(phone) ||
                        title.includes(phone.replace(/^55/, '')) || // Sem o 55
                        title.includes(phone.slice(-8)); // Últimos 8 dígitos
                });
                if (matchingCard) {
                    console.log(`[Trello] Card encontrado: ${matchingCard.name}`);
                    return matchingCard;
                }
                // Fallback: retorna o primeiro resultado
                return response.data.cards[0];
            }
            return null;
        } catch (error) {
            console.error('Error searching Trello:', error.message);
            return null;
        }
    }

    async addCommentToCard(id, text) {
        await trelloClient.post(`/cards/${id}/actions/comments`, { text });
    }

    async sendWhatsappMessage(phone, msg) {
        await zapiClient.post('/send-text', { phone, message: msg });
    }

    // ==================== TRANSCRIÇÃO DE ÁUDIO (WHISPER) ====================
    async transcribeAudio(audioUrl) {
        const axios = require('axios');
        const FormData = require('form-data');

        try {
            // 1. Baixa o áudio da URL
            console.log('[Whisper] Baixando áudio...');
            const audioResponse = await axios.get(audioUrl, {
                responseType: 'arraybuffer',
                timeout: 30000
            });

            // 2. Prepara o FormData para o Whisper
            const formData = new FormData();
            formData.append('file', Buffer.from(audioResponse.data), {
                filename: 'audio.ogg',
                contentType: 'audio/ogg'
            });
            formData.append('model', 'whisper-1');
            formData.append('language', 'pt');

            // 3. Envia para a API do Whisper
            console.log('[Whisper] Transcrevendo...');
            const transcriptionResponse = await axios.post(
                'https://api.openai.com/v1/audio/transcriptions',
                formData,
                {
                    headers: {
                        ...formData.getHeaders(),
                        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
                    },
                    timeout: 60000
                }
            );

            const transcription = transcriptionResponse.data.text;
            console.log(`[Whisper] Transcrição concluída: ${transcription.substring(0, 50)}...`);
            return transcription;

        } catch (error) {
            console.error('[Whisper] Erro:', error.message);
            throw new Error('Falha na transcrição do áudio');
        }
    }
}

module.exports = new AutomationService();
