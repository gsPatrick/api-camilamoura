const { zapiClient, trelloClient, openaiClient } = require('../../config/apiClients');
const BotConfig = require('../../models/botConfig');
const Conversation = require('../../models/conversation');
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
            const existingCard = await this.findTrelloCard(phone);
            if (existingCard) {
                console.log(`[Trello] Card encontrado para ${phone}. Adicionando comentário.`);
                await this.addCommentToCard(existingCard.id, `Nova mensagem do cliente:\n${message}`);
                return;
            }

            // 2. Fluxo de Novo Lead
            await this.handleLeadFlow(phone, message);

        } catch (error) {
            console.error('Error processing webhook:', error);
        }
    }

    async handleLeadFlow(phone, message) {
        let conversation = await Conversation.findOne({ where: { phone } });

        // Cenário A: Primeira interação
        if (!conversation) {
            console.log(`[Flow] Novo contato: ${phone}. Enviando Aviso Ético.`);

            const avisoEtico = await BotConfig.findOne({ where: { key: 'AVISO_ETICO' } });
            const text = avisoEtico ? avisoEtico.value :
                'Olá! Você entrou em contato com o escritório da Dra. Camila Moura. ⚖️\n\nPor favor, descreva brevemente sua situação para que possamos direcionar seu atendimento.';

            await this.sendWhatsappMessage(phone, text);

            await Conversation.create({
                phone,
                step: 'WAITING_FOR_INPUT'
            });
            return;
        }

        // Cenário B: Cliente respondeu após o Aviso Ético
        if (conversation.step === 'WAITING_FOR_INPUT') {
            console.log(`[Flow] Recebido relato de ${phone}. Processando...`);

            // Mensagem de processamento (SEM mencionar IA)
            await this.sendWhatsappMessage(phone, "Recebemos seu relato! Estamos analisando seu caso... ⏳");

            // Classificação com IA
            const classification = await this.classifyCase(message);

            // Verifica encerramento automático
            if (classification.should_close) {
                const closeMsg = await this.getCloseMessage(classification.close_reason);
                await this.sendWhatsappMessage(phone, closeMsg);
                await conversation.destroy();
                return;
            }

            // Verifica casos de atendimento presencial obrigatório
            const requiresInPerson = this.requiresInPersonAttendance(classification);

            if (requiresInPerson) {
                const msgPresencial = await BotConfig.findOne({ where: { key: 'MSG_PRESENCIAL' } });
                const presencialText = msgPresencial?.value ||
                    'Identificamos que seu caso requer atendimento presencial inicial. Por favor, entre em contato pelo telefone do escritório para agendar uma consulta.';
                await this.sendWhatsappMessage(phone, presencialText);
            }

            // Cria Card no Trello
            await this.createTrelloCard(phone, message, classification, requiresInPerson);

            // Limpa estado
            await conversation.destroy();

            // Mensagem final (SEM mencionar IA)
            await this.sendWhatsappMessage(phone, "Seu caso foi encaminhado para a Dra. Camila. Entraremos em contato em breve. ✅");
        }
    }

    async classifyCase(message) {
        // Labels exatas do board da cliente (verificadas via API)
        const systemPrompt = `Você é triagista jurídico do escritório da Dra. Camila Moura.
Analise o relato e classifique usando EXATAMENTE uma das categorias abaixo.

**CATEGORIAS DISPONÍVEIS (use exatamente estes nomes):**

PREVIDENCIÁRIO:
- "Incapacidade" - Auxílio-doença, aposentadoria por invalidez, acidentes, doenças, perícia
- "BPC Deficiente" - BPC/LOAS para pessoas com deficiência e baixa renda (inclui autismo, deficientes físicos/mentais, idosos 65+ sem contribuição)
- "Aposentadoria" - Por tempo de contribuição, idade, especial
- "Aposentadoria PcD" - Aposentadoria para pessoa com deficiência que trabalhou
- "Pensão por Morte" - Dependentes de segurado falecido
- "Adicional 25%" - Aposentados que precisam de cuidador permanente
- "Aux Acidente" - Auxílio-acidente, sequelas de acidente de trabalho
- "Revisão de Benefício" - Revisão de aposentadoria ou benefício existente

TRABALHISTA:
- "Reclamação Trabalhista" - Demissão, verbas rescisórias, horas extras, acidente de trabalho

CONSUMIDOR:
- "Consumidor" - Nome sujo indevido, cobranças, plano de saúde, bancos

OUTROS:
- "OUTROS" - Casos que não se encaixam nas categorias acima

**ENCERRAMENTO AUTOMÁTICO (should_close = true):**
- Cliente menciona já ter advogado constituído → close_reason: "has_lawyer"
- Assunto criminal, família, divórcio, imobiliário → close_reason: "outside_area"

**RESPONDA APENAS JSON:**
{
  "client_name": "Nome extraído ou null",
  "type": "Categoria EXATA da lista acima",
  "urgency": "Alta" | "Normal",
  "summary": "Resumo objetivo do caso",
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
            console.error('OpenAI Error:', error.response?.data || error.message);
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
        // Casos previdenciários que exigem atendimento presencial
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
                    'Entendemos. Como você já possui advogado constituído, por ética profissional (OAB), não podemos prosseguir. Recomendamos contatar seu advogado atual.\n\nAtendimento encerrado.';
            case 'outside_area':
                return 'Agradecemos seu contato. Infelizmente, este assunto não está entre as áreas atendidas pelo nosso escritório (Previdenciário, Trabalhista e Consumidor).\n\nRecomendamos buscar um especialista na área específica.';
            case 'incompatible':
                return 'Agradecemos seu contato. No momento, não podemos atender sua solicitação através deste canal.\n\nPara demandas específicas, entre em contato diretamente com o escritório.';
            default:
                return 'Atendimento encerrado. Obrigado pelo contato.';
        }
    }

    async findTrelloCard(phone) {
        try {
            const response = await trelloClient.get(`/search`, {
                params: {
                    query: phone,
                    modelTypes: 'cards',
                    idBoards: boardId,
                    partial: true
                }
            });
            return (response.data?.cards?.length > 0) ? response.data.cards[0] : null;
        } catch (error) {
            console.error('Error searching Trello:', error);
            return null;
        }
    }

    async addCommentToCard(id, text) {
        await trelloClient.post(`/cards/${id}/actions/comments`, { text });
    }

    async sendWhatsappMessage(phone, msg) {
        await zapiClient.post('/send-text', { phone, message: msg });
    }

    async createTrelloCard(phone, message, classification, isUrgent) {
        try {
            // 1. Define lista de entrada
            const configList = await BotConfig.findOne({ where: { key: 'TRELLO_LIST_ID' } });
            let targetListId = configList?.value;

            if (!targetListId) {
                try {
                    const listsRes = await trelloClient.get(`/boards/${boardId}/lists`);
                    const lists = listsRes.data;
                    const fallbackList = lists.find(l => /triagem|checklist|novos|entrada/i.test(l.name)) || lists[0];
                    if (fallbackList) targetListId = fallbackList.id;
                } catch (e) { console.error('Error fetching lists:', e.message); }
            }

            if (!targetListId) throw new Error('Target List not found');

            // 2. Nome do cliente (ou telefone se não informado)
            const clientName = classification.client_name || phone;
            const cardTitle = `${clientName.toUpperCase()}: ${phone}`;

            // 3. Descrição no formato solicitado
            const description =
                `ÁREA: ${classification.type || 'Geral'}

Telefone: ${phone}
Resumo: ${classification.summary}
Urgência: ${classification.urgency}

---
Relato Original:
${message}`;

            // 4. Busca etiqueta pelo NOME da categoria
            const labelIds = [];
            try {
                const labelsRes = await trelloClient.get(`/boards/${boardId}/labels`);
                const labels = labelsRes.data;

                // Busca label que corresponde ao tipo classificado
                const matchedLabel = labels.find(l =>
                    l.name && l.name.toLowerCase() === classification.type?.toLowerCase()
                );

                if (matchedLabel) {
                    labelIds.push(matchedLabel.id);
                    console.log(`[Label] Encontrada: ${matchedLabel.name} (${matchedLabel.id})`);
                } else {
                    console.log(`[Label] Não encontrada para tipo: ${classification.type}`);
                }
            } catch (e) {
                console.error('Error fetching labels:', e.message);
            }

            // 5. Cria o card
            const cardData = {
                idList: targetListId,
                name: cardTitle,
                desc: description,
                pos: 'top',
                idLabels: labelIds
            };

            const createdCard = await trelloClient.post('/cards', cardData);
            console.log(`[Trello] Card criado: ${createdCard.data.id} - ${cardTitle}`);

        } catch (error) {
            console.error('Trello Create Error:', error);
        }
    }
}

module.exports = new AutomationService();

