const { zapiClient, trelloClient, openaiClient } = require('../../config/apiClients');
const BotConfig = require('../../models/botConfig');
const Conversation = require('../../models/conversation'); // Importando o modelo de estado
const boardId = process.env.TRELLO_BOARD_ID;

class AutomationService {
    async processWebhook(webhookData) {
        if (!webhookData || !webhookData.phone) return;
        if (webhookData.fromMe) return;

        const phone = webhookData.phone;
        const message = webhookData.text && webhookData.text.message ? webhookData.text.message : '';

        if (!message) return;

        try {
            // 1. Verifica se já existe Card no Trello (Cliente Antigo)
            // Se existir, apenas comenta e encerra.
            const existingCard = await this.findTrelloCard(phone);
            if (existingCard) {
                console.log(`[Trello] Card encontrado para ${phone}. Adicionando comentário.`);
                await this.addCommentToCard(existingCard.id, `Mensagem do Cliente: ${message}`);
                return;
            }

            // 2. Fluxo de Novo Lead -> Gestão de Estado
            await this.handleLeadFlow(phone, message);

        } catch (error) {
            console.error('Error processing webhook:', error);
        }
    }

    async handleLeadFlow(phone, message) {
        // Verifica estado da conversa no DB local
        let conversation = await Conversation.findOne({ where: { phone } });

        // Cenario A: Primeira interação (Sem registro)
        if (!conversation) {
            console.log(`[Flow] Novo contato: ${phone}. Enviando Aviso Ético.`);

            const avisoEtico = await BotConfig.findOne({ where: { key: 'AVISO_ETICO' } });
            const text = avisoEtico ? avisoEtico.value : 'Olá, aguarde um momento...';

            await this.sendWhatsappMessage(phone, text);

            // Salva estado para esperar a resposta (o relato do caso)
            await Conversation.create({
                phone,
                step: 'WAITING_FOR_INPUT'
            });
            return;
        }

        // Cenario B: Cliente respondeu após o Aviso Ético (O relato do caso)
        if (conversation.step === 'WAITING_FOR_INPUT') {
            console.log(`[Flow] Recebido relato de ${phone}. Iniciando Triagem IA.`);

            // 1. Obter prompt base e especialidades do banco
            const basePromptConfig = await BotConfig.findOne({ where: { key: 'PROMPT_SISTEMA_BASE' } });
            const specialtiesConfig = await BotConfig.findOne({ where: { key: 'SPECIALTIES_JSON' } });

            let systemPromptText = '';

            if (basePromptConfig) systemPromptText += basePromptConfig.value + '\n\n';

            if (specialtiesConfig) {
                try {
                    const specialties = JSON.parse(specialtiesConfig.value);
                    systemPromptText += `Instrução: Classifique o relato do cliente com base nestas categorias:\n`;
                    systemPromptText += specialties.map(c =>
                        `- ${c.name}: Gatilhos: [${c.keywords}]. Regras: ${c.rules}. Urgência: ${c.urgent ? 'ALTA' : 'NORMAL'}`
                    ).join('\n');
                } catch (e) {
                    console.error('Erro ao processar JSON de especialidades:', e);
                }
            }

            systemPromptText += `
---
**SAÍDA OBRIGATÓRIA (JSON ESTRICTO):**
{
  "client_name": "Nome do Cliente (ou null)",
  "type": "Categoria Identificada (entre as listadas acima ou Outros)",
  "urgency": "Alta" | "Baixa",
  "summary": "Resumo do caso em 1 frase"
}`;

            await this.sendWhatsappMessage(phone, "Recebi seu relato. Nossa inteligência artificial está analisando para priorizar seu caso... ⏳");

            let classification;
            try {
                const response = await openaiClient.post('/chat/completions', {
                    model: "gpt-4-turbo-preview",
                    messages: [
                        { role: "system", content: systemPromptText },
                        { role: "user", content: `Relato do cliente: "${message}"` }
                    ],
                    response_format: { type: "json_object" },
                    temperature: 0.0
                });
                classification = JSON.parse(response.data.choices[0].message.content);
            } catch (error) {
                console.error('OpenAI Error:', error.response?.data || error.message);
                classification = { type: 'Geral', urgency: 'Low', summary: message };
            }

            const urgencyKeywords = ['Incapacidade', 'Acidente', 'Doença', 'Liminar'];
            let isUrgent = classification.urgency === 'Alta' || urgencyKeywords.some(kw => classification.type && classification.type.includes(kw));

            if (isUrgent) {
                const msgPresencial = await BotConfig.findOne({ where: { key: 'MSG_PRESENCIAL' } });
                const presencialText = msgPresencial?.value || 'Caso urgente detectado.';
                await this.sendWhatsappMessage(phone, presencialText);
            }

            // Cria Card no Trello
            await this.createTrelloCard(phone, message, classification, isUrgent);

            // Limpa estado (ou marca como 'COMPLETED') para que próximas msgs caiam no fluxo de "Card Existente"
            // Como o card demora uns ms para indexar na busca do Trello, idealmente manteríamos o state
            // mas vamos deletar para limpar a tabela, pois na próxima msg o findTrelloCard deve achar.
            await conversation.destroy();

            await this.sendWhatsappMessage(phone, "Pronto! Seu caso foi encaminhado para a Dra. Camila. Em breve entraremos em contato. ✅");
        }
    }

    async findTrelloCard(phone) {
        try {
            // BUSCA GLOBAL NO BOARD (Safety: Garante que não duplica se já estiver em 'Judicial' etc)
            const response = await trelloClient.get(`/search`, {
                params: {
                    query: phone,
                    modelTypes: 'cards',
                    idBoards: boardId,
                    partial: true // Match parcial para garantir
                }
            });
            // Retorna o primeiro card encontrado em qualquer lista do board
            return (response.data?.cards?.length > 0) ? response.data.cards[0] : null;
        } catch (error) {
            console.error('Error searching Trello:', error);
            return null;
        }
    }

    async addCommentToCard(id, text) { await trelloClient.post(`/cards/${id}/actions/comments`, { text }); }
    async sendWhatsappMessage(phone, msg) { await zapiClient.post('/send-text', { phone, message: msg }); }

    async classifyWithOpenAI(systemPrompt, userMessage) {
        try {
            const completion = await openaiClient.post('/chat/completions', {
                model: "gpt-3.5-turbo",
                messages: [
                    { role: "system", content: systemPrompt }, // Prompt já deve conter instrução JSON
                    { role: "user", content: userMessage }
                ],
                temperature: 0.0 // Mais determinístico
            });
            const content = completion.data.choices[0].message.content;
            return JSON.parse(content);
        } catch (error) {
            console.error('OpenAI Error:', error.response?.data || error.message);
            return { type: 'Geral', urgency: 'Low', summary: userMessage };
        }
    }

    async createTrelloCard(phone, message, classification, isUrgent) {
        try {
            // 1. Definição da Lista de Entrada
            const configList = await BotConfig.findOne({ where: { key: 'TRELLO_LIST_ID' } });
            let targetListId = configList?.value;

            // Fallback inteligente se não configurado
            if (!targetListId) {
                try {
                    const listsRes = await trelloClient.get(`/boards/${boardId}/lists`);
                    const lists = listsRes.data;
                    const fallbackList = lists.find(l => /triagem|novos|entrada/i.test(l.name)) || lists[0];
                    if (fallbackList) targetListId = fallbackList.id;
                } catch (e) { console.error('Error fetching lists:', e.message); }
            }

            if (!targetListId) throw new Error('Target List not found');

            // 2. Montagem da Descrição
            const description = `ÁREA: ${classification.type || 'Geral'}\n\n` +
                `Telefone: ${phone}\n` +
                `**Resumo IA:** ${classification.summary}\n` +
                `**Urgência:** ${classification.urgency}\n\n` +
                `---\n*Relato Original:*\n${message}`;

            // 3. Preparação de Etiquetas (Labels)
            const labelIds = [];
            let boardLabels = null;

            // Helper to get labels if needed
            const getBoardLabels = async () => {
                if (!boardLabels) {
                    try {
                        const res = await trelloClient.get(`/boards/${boardId}/labels`);
                        boardLabels = res.data;
                    } catch (e) { console.error('Error fetching labels:', e.message); boardLabels = []; }
                }
                return boardLabels;
            };

            // A. Etiqueta de Especialidade
            const specialtiesConfig = await BotConfig.findOne({ where: { key: 'SPECIALTIES_JSON' } });
            if (specialtiesConfig) {
                try {
                    const specialties = JSON.parse(specialtiesConfig.value);
                    const matchedSpec = specialties.find(s => s.name === classification.type);
                    if (matchedSpec && matchedSpec.labelId) labelIds.push(matchedSpec.labelId);
                } catch (e) { console.error('Error parsing specialities:', e); }
            } else {
                // Fallback: Tenta achar label com o mesmo nome
                try {
                    const labels = await getBoardLabels();
                    const match = labels.find(l => l.name && l.name.toLowerCase() === classification.type?.toLowerCase());
                    if (match) labelIds.push(match.id);
                } catch (e) { /* ignore */ }
            }

            // B. Etiqueta de Urgência
            if (isUrgent) {
                const configUrgent = await BotConfig.findOne({ where: { key: 'TRELLO_LABEL_URGENTE_ID' } });
                if (configUrgent?.value) {
                    labelIds.push(configUrgent.value);
                } else {
                    // Fallback Inteligente
                    try {
                        const labels = await getBoardLabels();
                        const urgentLabel = labels.find(l =>
                            (l.name && /urgente|high|prioridade/i.test(l.name)) ||
                            (l.color === 'red')
                        );
                        if (urgentLabel) {
                            console.log(`[Smart Fallback] Label Urgente encontrada: ${urgentLabel.name} (${urgentLabel.id})`);
                            labelIds.push(urgentLabel.id);
                        }
                    } catch (e) { /* ignore */ }
                }
            }

            const cardData = {
                idList: targetListId,
                name: `${classification.type || 'Novo'}: ${phone}`,
                desc: description,
                pos: 'top',
                idLabels: labelIds
            };

            const createdCard = await trelloClient.post('/cards', cardData);
            const cardId = createdCard.data.id;
            console.log(`[Trello] Card criado: ${cardId} com labels: ${labelIds.join(', ')}`);

            // Garantia (Fallback loop)
            if (labelIds.length > 0) {
                for (const labelId of labelIds) {
                    await trelloClient.post(`/cards/${cardId}/idLabels`, { value: labelId })
                        .catch(err => {
                            if (!err.response || (err.response.status !== 400 && err.response.status !== 409)) {
                                console.error(`[Warn] Falha na garantia de label ${labelId}:`, err.message);
                            }
                        });
                }
            }

        } catch (error) {
            console.error('Trello Create Error:', error);
        }
    }
}

module.exports = new AutomationService();
