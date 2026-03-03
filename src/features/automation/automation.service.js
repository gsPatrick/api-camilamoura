const {
  zapiClient,
  trelloClient,
  openaiClient,
} = require("../../config/apiClients");
const BotConfig = require("../../models/botConfig");
const Conversation = require("../../models/conversation");
const FlowConfig = require("../../models/flowConfig");
const FlowQuestion = require("../../models/flowQuestion");
const KnowledgeBase = require("../../models/knowledgeBase");
const boardId = process.env.TRELLO_BOARD_ID;

class AutomationService {
  async processWebhook(webhookData) {
    if (!webhookData || !webhookData.phone) return;
    if (webhookData.fromMe) return;

    // ===== FILTRO v2.0: BLOQUEIO DE GRUPOS =====
    // Na Z-API, webhooks de grupo possuem isGroup=true, participantPhone, ou o phone contém '-' (ex: 55119999-1234)
    const isGroupMessage =
      webhookData.isGroup === true ||
      webhookData.isGroup === "true" ||
      !!webhookData.participantPhone ||
      (webhookData.phone && webhookData.phone.includes("-")) ||
      (webhookData.phone && webhookData.phone.includes("@g.us")) ||
      (webhookData.chatId && webhookData.chatId.includes("@g.us"));

    if (isGroupMessage) {
      console.log(
        `[GRUPO] Mensagem de grupo ignorada: ${webhookData.phone || webhookData.chatId}`,
      );
      return;
    }

    const phone = webhookData.phone;
    let message = "";
    let isAudioTranscription = false;

    // Suporte a mensagens de texto
    if (webhookData.text && webhookData.text.message) {
      message = webhookData.text.message;
    }

    // Suporte a mensagens de áudio - transcrição com Whisper
    if (webhookData.audio && webhookData.audio.audioUrl) {
      console.log(`[Audio] Recebido áudio de ${phone}, transcrevendo...`);
      try {
        message = await this.transcribeAudio(webhookData.audio.audioUrl);
        isAudioTranscription = true;
        console.log(`[Audio] Transcrição: ${message.substring(0, 100)}...`);
      } catch (err) {
        console.error("[Audio] Erro na transcrição:", err.message);
        await this.sendWhatsappMessage(
          phone,
          "Desculpe, não consegui ouvir seu áudio. Pode digitar sua mensagem, por favor?",
        );
        return;
      }
    }

    if (!message) return;

    // Marca áudio transcrito para contexto da IA
    if (isAudioTranscription) {
      message = `(Áudio transcrito): ${message}`;
    }

    try {
      // 1. Verifica se já existe Card no Trello (Cliente Antigo)
      const existingCard = await this.findTrelloCard(phone);
      if (existingCard) {
        // ===== LÓGICA v2.0: HUMAN_ONLY MODE =====
        // Verifica em qual lista do Trello o card está
        const isInTriageList = await this.isCardInTriageList(
          existingCard.idList,
        );

        if (!isInTriageList) {
          // Card está em lista de atendimento humano (Análise, Finalizado, etc)
          // Apenas registra comentário, NÃO responde via IA
          console.log(
            `[HUMAN_ONLY] Card ${existingCard.name} está em lista de atendimento humano. Apenas registrando.`,
          );
          await this.addCommentToCard(
            existingCard.id,
            `📩 Nova mensagem do cliente (modo HUMAN_ONLY):\n${message}`,
          );
          return;
        }

        // Card está na lista de Triagem - adiciona comentário normalmente
        console.log(
          `[Trello] Card encontrado na triagem para ${phone}. Adicionando comentário.`,
        );
        await this.addCommentToCard(
          existingCard.id,
          `Nova mensagem do cliente:\n${message}`,
        );
        return;
      }

      // 2. Fluxo de Novo Lead (baseado na configuração)
      await this.handleLeadFlow(phone, message);
    } catch (error) {
      console.error("Error processing webhook:", error);
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

        // ====== LÓGICA DE RETORNO (Prompt Mestre) ======
        if (conversation) {
            const lastUpdate = new Date(conversation.updatedAt);
            const now = new Date();
            const diffHours = (now - lastUpdate) / (1000 * 60 * 60);
            
            // Pega apenas o primeiro nome caso o banco tenha salvo algo longo por engano anterior
            const storedName = conversation.clientName || '';
            const firstName = storedName.split(' ')[0] || 'que bom ter você de volta';
            const shortFirstName = storedName.split(' ')[0] || '';

            // 1. Caso Encerrado (CLOSED)
            if (conversation.step === 'CLOSED') {
                await this.sendWhatsappMessage(phone, `Olá, ${firstName}! Aqui é a Carol. Você quer falar sobre o caso que encaminhamos ou é um novo assunto?`);
                conversation.step = 'WAITING_SUBJECT_CHOICE'; // Novo passo temporário
                await conversation.save();
                return;
            }

            // 2. Retorno antes de 24h
            if (diffHours < 24 && conversation.step !== 'INITIAL') {
                console.log(`[Flow] Retorno < 24h de ${phone}`);
                // Se o cliente apenas enviou algo, confirmamos o recebimento e anexamos se for o caso
                // Mas aqui deixamos o fluxo normal seguir se ele estiver no meio de uma triagem
                if (conversation.step === 'AI_CHAT') {
                    await this.handleAIChat(conversation, flowConfig, message);
                    return;
                }
            }

            // 3. Retorno depois de 24h
            if (diffHours >= 24 && conversation.step !== 'INITIAL') {
                console.log(`[Flow] Retorno > 24h de ${phone}`);
                await this.sendWhatsappMessage(phone, `Olá novamente${shortFirstName ? ', ' + shortFirstName : ''}! Aqui é a Carol. Como posso ajudar hoje? 🌸`);
                // Mantém o estado mas sinaliza boas-vindas curtas
            }
        }

        // ====== PRIMEIRA INTERAÇÃO - Envia Aviso Ético (Welcome) ======
        if (!conversation) {
            console.log(`[Flow] Novo contato: ${phone}.`);

            const avisoEtico = await BotConfig.findOne({ where: { key: 'AVISO_ETICO' } });
            const welcomeText = avisoEtico?.value || 'Olá! Você entrou em contato com a Advocacia Camila Moura...';

            await this.sendWhatsappMessage(phone, welcomeText);

            // Cria conversa no passo WAITING_NAME
            conversation = await Conversation.create({
                phone,
                step: 'WAITING_NAME',
                responses: {},
                messageHistory: [{ role: 'assistant', content: welcomeText }],
                currentQuestionIndex: 0,
                aiQuestionCount: 0
            });
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

        // Processa resposta baseada no passo atual (Prompt Mestre State Machine)
        await this.processStepLogic(conversation, flowConfig, message);
    }

    // ==================== LÓGICA DE PASSOS (STATE MACHINE) ====================
    async processStepLogic(conversation, flowConfig, message) {
        const phone = conversation.phone;

        switch (conversation.step) {
            case 'WAITING_NAME':
                // Extrai nome usando o helper aprimorado, ou faz fallback básico
                let extractedName = await this.extractNameFromMessage(message);
                
                if (!extractedName) {
                    extractedName = 'Cliente';
                }
                
                // Pega apenas o primeiro nome para uma comunicação mais próxima
                const firstName = extractedName.split(' ')[0] || 'Cliente';
                
                conversation.clientName = extractedName;
                conversation.step = 'LAWYER_CHECK';
                await conversation.save();

                await this.sendWhatsappMessage(phone, `Obrigada, ${firstName}!\n\nAntes de começarmos, preciso fazer uma pergunta importante:\n\nVocê já possui algum advogado cuidando deste assunto atualmente?`);
                break;

            case 'LAWYER_CHECK':
                const hasLawyer = /sim|tenho|possuo/i.test(message) && !/n[ãa]o/i.test(message);
                
                if (hasLawyer) {
                    const msgAdv = await BotConfig.findOne({ where: { key: 'MSG_ADVOGADO_EXISTENTE' } });
                    await this.sendWhatsappMessage(phone, msgAdv?.value || 'Por ética profissional, não podemos atender...');
                    conversation.step = 'CLOSED';
                    await conversation.save();
                } else {
                    conversation.step = 'DEMAND_SELECTION';
                    await conversation.save();
                    await this.sendWhatsappMessage(phone, `Perfeito! Então vamos continuar. ✅\n\nPara que eu possa direcionar você ao profissional adequado, preciso entender melhor sua situação:\n\nSobre qual assunto você busca orientação?\n\n1️⃣ Previdenciário (aposentadoria, auxílio-doença, BPC, etc.)\n2️⃣ Trabalhista (rescisão, horas extras, assédio, etc.)\n3️⃣ Consumidor (problemas com compras, cobranças, etc.)\n4️⃣ Outro assunto`);
                }
                break;

            case 'DEMAND_SELECTION':
                if (/1|previdenci[áa]rio/i.test(message)) {
                    conversation.selectedModule = 'PREVIDENCIARIO';
                    conversation.step = 'CNIS_CHECK';
                } else if (/2|trabalhista/i.test(message)) {
                    conversation.selectedModule = 'TRABALHISTA';
                    conversation.step = 'COLLECTING';
                } else if (/3|consumidor/i.test(message)) {
                    conversation.selectedModule = 'CONSUMIDOR';
                    conversation.step = 'COLLECTING';
                } else {
                    conversation.selectedModule = 'OUTROS';
                    conversation.step = 'COLLECTING';
                }
                await conversation.save();

                if (conversation.step === 'CNIS_CHECK') {
                    await this.sendWhatsappMessage(phone, `${conversation.clientName.split(' ')[0]}, para questões previdenciárias, o CNIS - Extrato Previdenciário é ESSENCIAL para qualquer análise.\n\nSem esse documento, é impossível avaliar seu caso com precisão!\n\nVocê já tem o CNIS em mãos?`);
                } else {
                    // Segue para triagem normal (AI ou Manual)
                    await this.sendNextQuestion(conversation, flowConfig, message);
                }
                break;

            case 'CNIS_CHECK':
                const hasCNIS = /sim|tenho/i.test(message);
                if (hasCNIS) {
                    await this.sendWhatsappMessage(phone, `Perfeito! Pode me enviar agora ou mais tarde, mas vou precisar dele para a análise, ok?\n\nEnquanto isso, vamos continuar com as perguntas!`);
                } else {
                    const cnisInst = await BotConfig.findOne({ where: { key: 'CNIS_INSTRUCTIONS' } });
                    await this.sendWhatsappMessage(phone, cnisInst?.value || 'Procure o Meu INSS...');
                }
                conversation.step = 'COLLECTING';
                await conversation.save();
                await this.sendNextQuestion(conversation, flowConfig, message);
                break;

            case 'WAITING_SUBJECT_CHOICE':
                if (/novo|outr[oa]/i.test(message)) {
                    // Reseta para novo atendimento (mantendo nome)
                    conversation.step = 'LAWYER_CHECK';
                    conversation.responses = {};
                    conversation.aiQuestionCount = 0;
                    await conversation.save();
                    await this.sendWhatsappMessage(phone, `Entendido! Vamos iniciar um novo atendimento para você.\n\nVocê já possui algum advogado cuidando deste NOVO assunto atualmente?`);
                } else {
                    await this.sendWhatsappMessage(phone, `Vou registrar sua mensagem e nossa equipe jurídica vai retornar em breve sobre o seu caso anterior! ✅`);
                    // Opcionalmente adiciona comentário ao Trello
                    const card = await this.findTrelloCard(phone);
                    if (card) await this.addCommentToCard(card.id, `Mensagem de cliente recorrente:\n${message}`);
                }
                break;

            default:
                await this.processResponse(conversation, flowConfig, message);
        }
    }

  // ==================== ENVIA PRÓXIMA PERGUNTA ====================
  async sendNextQuestion(conversation, flowConfig, previousMessage) {
    const mode = flowConfig.mode;

    if (mode === "MANUAL") {
      // Modo Manual: Perguntas fixas definidas pela advogada
      const questions = await FlowQuestion.findAll({
        where: { flowConfigId: flowConfig.id },
        order: [["order", "ASC"]],
      });

      if (questions.length === 0) {
        // Fallback: Se não tem perguntas configuradas, pede nome e relato
        await this.sendWhatsappMessage(
          conversation.phone,
          "Qual é o seu nome completo? 📝",
        );
        conversation.step = "COLLECTING";
        conversation.currentQuestionIndex = -1; // Indica fallback
        await conversation.save();
        return;
      }

      const currentIndex = conversation.currentQuestionIndex;
      if (currentIndex < questions.length) {
        await this.sendWhatsappMessage(
          conversation.phone,
          questions[currentIndex].question,
        );
        conversation.step = "COLLECTING";
        await conversation.save();
      }
    } else if (mode === "AI_FIXED" || mode === "AI_DYNAMIC") {
      // Modos IA: Primeira pergunta sempre pede relato
      await this.sendWhatsappMessage(
        conversation.phone,
        "Para que possamos entender melhor seu caso, por favor, descreva detalhadamente sua situação. 📝",
      );
      conversation.step = "COLLECTING";
      await conversation.save();
    }
  }

  // ==================== PROCESSA RESPOSTA ====================
  async processResponse(conversation, flowConfig, message) {
    const mode = flowConfig.mode;
    const phone = conversation.phone;

    if (mode === "MANUAL") {
      await this.processManualModeResponse(conversation, flowConfig, message);
    } else if (mode === "AI_FIXED") {
      await this.processAIFixedResponse(conversation, flowConfig, message);
    } else if (mode === "AI_DYNAMIC") {
      await this.processAIDynamicResponse(conversation, flowConfig, message);
    }
  }

  // ==================== MODO MANUAL ====================
  async processManualModeResponse(conversation, flowConfig, message) {
    const questions = await FlowQuestion.findAll({
      where: { flowConfigId: flowConfig.id },
      order: [["order", "ASC"]],
    });

    const currentIndex = conversation.currentQuestionIndex;

    // Fallback se não tem perguntas configuradas
    if (questions.length === 0 || currentIndex === -1) {
      // Primeira resposta = nome
      if (!conversation.clientName) {
        let clientName = await this.extractNameFromMessage(message);
        if (!clientName) clientName = 'Cliente';

        conversation.clientName = clientName;
        conversation.currentQuestionIndex = -2;
        await conversation.save();

        await this.sendWhatsappMessage(
          conversation.phone,
          `Prazer, ${clientName.split(" ")[0]}! 😊\n\nDescreva brevemente sua situação.`,
        );
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
      if (currentQuestion.variableName === "nome") {
        let clientName = await this.extractNameFromMessage(message);
        if (!clientName) clientName = 'Cliente';
        conversation.clientName = clientName;
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
      const followUpQuestion = await this.generateAIFollowUp(
        conversation,
        maxQuestions - questionsAsked,
      );

      if (followUpQuestion && followUpQuestion !== "SUFFICIENT") {
        // Adiciona ao histórico
        const history = conversation.messageHistory || [];
        history.push({ role: "assistant", content: followUpQuestion });
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
        history.push({ role: "assistant", content: result.question });
        conversation.messageHistory = history;

        await conversation.save();
        await this.sendWhatsappMessage(conversation.phone, result.question);
        return;
      }
    }

    // Atingiu limite ou tem info suficiente
    await this.finalizeTriage(conversation, flowConfig, message);
  }

  // ==================== GERA PERGUNTA DE FOLLOW-UP (IA FIXA) ====================
  async generateAIFollowUp(conversation, remainingQuestions) {
    const history = conversation.messageHistory || [];
    const responses = conversation.responses || {};

    const knowledgeContext = await this.getKnowledgeContext();

    const systemPrompt = `Você é Carol, assistente virtual da Advocacia Camila Moura.
Seja empática, acolhedora e profissional. Use linguagem natural e humana.

ÁREAS DE ATUAÇÃO: Previdenciário (aposentadorias, BPC, auxílios), Trabalhista e Consumidor.

REGRAS IMPORTANTES (PROMPT MESTRE):
- NUNCA use listas numeradas ou menus de opções
- NUNCA dê "aulas" sobre direito, apenas faça perguntas para triagem
- NUNCA dê garantias de resultado ou valores
- Use as informações da BASE DE CONHECIMENTO abaixo para fazer perguntas investigativas sobre requisitos
- Seja concisa mas empática (se cliente mencionar falecimento, expresse condolências)
- UMA pergunta por vez (evite questionário robotizado)
- Aguarde resposta antes de prosseguir

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
        ...history.slice(-6),
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
Analise a conversa e siga o PROMPT MESTRE:

REGRAS:
- Empatia e acolhimento em primeiro lugar.
- UMA pergunta por vez.
- NUNCA dê consultoria jurídica, garantias ou valores.
- Identifique se tem INFO SUFICIENTE (nome, área, situação básica).

${knowledgeContext}

Responda EXATAMENTE em JSON:
{
  "needsMoreInfo": true,
  "question": "Sua única pergunta aqui",
  "shouldClose": false,
  "closeReason": null
}

Seja eficiente. Máximo 6 perguntas no total.`;

    try {
      const messages = [
        { role: 'system', content: systemPrompt },
        ...history.slice(-10),
      ];

      const response = await openaiClient.post('/chat/completions', {
        model: "gpt-4-turbo-preview",
        messages,
        response_format: { type: "json_object" },
        max_tokens: 350,
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

    await this.sendWhatsappMessage(phone, "Pronto! Já reuni todas as informações principais! ✅");

    let fullContext = "";
    for (const [key, value] of Object.entries(responses)) {
      fullContext += `${key}: ${value}\n`;
    }
    fullContext += `\nÚltima mensagem: ${lastMessage}`;
    const classification = await this.classifyCase(fullContext);

    if (classification.should_close) {
      const closeMsg = await this.getCloseMessage(classification.close_reason);
      await this.sendWhatsappMessage(phone, closeMsg);
      conversation.step = 'CLOSED';
      await conversation.save();
      return;
    }

    const docCount = Object.keys(responses).length;
    const resumoFinal = `**RESUMO DO SEU CASO:**\nÁrea: ${classification.type || 'Geral'}\nSituação: ${classification.summary || 'Análise de caso'}\nDocumentos: ${docCount > 0 ? 'Informações coletadas' : 'Pendente de envio'}\n---\nSeu caso foi encaminhado para nossa equipe jurídica.\nEntraremos em contato em até 48h úteis! ✅\n\nA Dra. Camila e equipe jurídica vão retornar com:\n✓ Avaliação sobre viabilidade do caso\n✓ Seus direitos nessa situação\n✓ Possíveis valores envolvidos\n✓ Próximos passos recomendados`;

    await this.sendWhatsappMessage(phone, resumoFinal);

    const requiresInPerson = this.requiresInPersonAttendance(classification);
    if (requiresInPerson) {
      const msgPresencial = await BotConfig.findOne({ where: { key: "MSG_PRESENCIAL" } });
      await this.sendWhatsappMessage(phone, msgPresencial?.value || "Identificamos que seu caso requer atendimento presencial.");
    }

    await this.createTrelloCardFromTemplate(phone, classification, responses, flowConfig);

    if (flowConfig.postAction === 'AI_RESPONSE') {
      conversation.step = 'AI_CHAT';
      await conversation.save();
      await this.sendWhatsappMessage(phone, `Se você lembrar de algo importante ou conseguir algum documento, pode enviar aqui a qualquer hora! Fique tranquilo(a), vamos cuidar do seu caso com toda atenção que ele merece!`);
    } else {
      conversation.step = 'CLOSED';
      await conversation.save();
    }
  }

  // ==================== CHAT COM IA (PÓS-TRIAGEM) ====================
  async handleAIChat(conversation, flowConfig, message) {
    const knowledgeContext = await this.getKnowledgeContext();
    const history = conversation.messageHistory || [];

    const systemPrompt = `Você é Carol, assistente virtual da Advocacia Camila Moura, especializada em Direito Previdenciário, Trabalhista e Consumidor.

O cliente já passou pela triagem inicial. Você está em modo pós-triagem.

REGRAS:
- Seja empática, acolhedora e profissional
- Responda dúvidas sobre documentos e procedimentos
- NÃO dê parecer jurídico específico ou previsões de resultado
- NÃO mencione valores ou honorários
- Referencie sempre "Dra. Camila e equipe jurídica" (nunca só "Camila")
- Se pergunta for muito específica: "A Dra. Camila e equipe jurídica vão te orientar na análise personalizada"
- Não reinicie a triagem se o cliente já respondeu as perguntas

${knowledgeContext}`;

    try {
      history.push({ role: "user", content: message });
      const messages = [
        { role: "system", content: systemPrompt },
        ...history.slice(-10),
      ];

      const response = await openaiClient.post("/chat/completions", {
        model: "gpt-4-turbo-preview",
        messages,
        max_tokens: 500,
        temperature: 0.7,
      });

      const aiResponse = response.data.choices[0].message.content.trim();
      history.push({ role: "assistant", content: aiResponse });
      conversation.messageHistory = history;
      await conversation.save();

      await this.sendWhatsappMessage(conversation.phone, aiResponse);

      const existingCard = await this.findTrelloCard(conversation.phone);
      if (existingCard) {
        await this.addCommentToCard(
          existingCard.id,
          `📱 Chat pós-triagem:\n\nCliente: ${message}\n\nAssistente: ${aiResponse}`,
        );
      }
    } catch (error) {
      console.error("AI Chat Error:", error.message);
      await this.sendWhatsappMessage(
        conversation.phone,
        "Desculpe, houve um problema. Por favor, aguarde o contato da nossa equipe.",
      );
    }
  }

  // ==================== HELPERS ====================

  async extractNameFromMessage(message) {
    let cleanMessage = message.trim().split('\n')[0].substring(0, 100);
    cleanMessage = cleanMessage.replace(/^(oba|ola|olá|oi|oii|bom dia|boa tarde|boa noite)\s*[,\.\-!\?]*\s*/i, '');
    cleanMessage = cleanMessage.replace(/^(meu nome e|meu nome é|sou|me chamo|eu sou|aqui e|aqui é|daqui fala|falo com)\s*[,\.\-!\?]*\s*/i, '');
    
    let name = cleanMessage.replace(/[^a-zA-ZÀ-ÿ\s]/g, '').trim();
    if (!name) return null;
    
    return name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  }

  async getKnowledgeContext() {
    try {
      const docs = await KnowledgeBase.findAll({
        where: { isActive: true },
        attributes: ["title", "content"],
      });

      if (docs.length === 0) return "";

      let context = "\n=== BASE DE CONHECIMENTO ===\n";
      docs.forEach((doc) => {
        context += `\n--- ${doc.title} ---\n${doc.content?.substring(0, 2000) || ""}\n`;
      });
      return context;
    } catch (e) {
      return "";
    }
  }

  async createTrelloCardFromTemplate(phone, classification, responses, flowConfig) {
    try {
      const configList = await BotConfig.findOne({ where: { key: "TRELLO_LIST_ID" } });
      let targetListId = configList?.value;

      if (!targetListId) {
        const listsRes = await trelloClient.get(`/boards/${boardId}/lists`);
        const fallbackList = listsRes.data.find((l) => /triagem|checklist|novos|entrada/i.test(l.name)) || listsRes.data[0];
        if (fallbackList) targetListId = fallbackList.id;
      }

      const data = {
        nome: responses.nome || classification.client_name || phone,
        telefone: phone,
        area: classification.type || "Geral",
        resumo: classification.summary || "",
        urgencia: classification.urgency || "Normal",
        relato: responses.relato || "",
        ...responses,
      };

      let cardTitle = (flowConfig.trelloTitleTemplate || "{nome} - {telefone}").toUpperCase();
      let cardDesc = flowConfig.trelloDescTemplate || "**Área:** {area}\n**Telefone:** {telefone}\n**Resumo:** {resumo}";

      Object.keys(data).forEach((key) => {
        const regex = new RegExp(`\\{${key}\\}`, "gi");
        cardTitle = cardTitle.replace(regex, data[key] || "");
        cardDesc = cardDesc.replace(regex, data[key] || "");
      });

      const labelIds = [];
      const labelsRes = await trelloClient.get(`/boards/${boardId}/labels`);
      const matchedLabel = labelsRes.data.find(l => l.name?.toLowerCase() === classification.type?.toLowerCase());
      if (matchedLabel) labelIds.push(matchedLabel.id);

      await trelloClient.post("/cards", {
        idList: targetListId,
        name: cardTitle,
        desc: cardDesc,
        pos: "top",
        idLabels: labelIds,
      });
    } catch (error) {
      console.error("Trello Create Error:", error.message);
    }
  }

  // ==================== FUNÇÕES CLASSIFICAÇÃO ====================

  async classifyCase(message) {
    const systemPrompt = `Você é triagista jurídico do escritório da Dra. Camila Moura.
Analise o relato e classifique usando EXATAMENTE uma das categorias abaixo:

PREVIDENCIÁRIO: Incapacidade, BPC Deficiente, Aposentadoria, Pensão por Morte, Adicional 25%, Aux Acidente.
TRABALHISTA: Reclamação Trabalhista.
CONSUMIDOR: Consumidor.

Responda apenas JSON:
{
  "client_name": "Nome ou null",
  "type": "Categoria",
  "urgency": "Alta" | "Normal",
  "summary": "Resumo objetivo",
  "should_close": false,
  "close_reason": null
}`;

    try {
      const response = await openaiClient.post("/chat/completions", {
        model: "gpt-4-turbo-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Relato: "${message}"` },
        ],
        response_format: { type: "json_object" },
        temperature: 0.0,
      });
      return JSON.parse(response.data.choices[0].message.content);
    } catch (error) {
      return { type: "Geral", urgency: "Normal", summary: message.substring(0, 100), should_close: false };
    }
  }

  requiresInPersonAttendance(classification) {
    const inPersonKeywords = ["Incapacidade", "doença", "acidente", "perícia"];
    const type = (classification.type || "").toLowerCase();
    const summary = (classification.summary || "").toLowerCase();
    return type === "incapacidade" || inPersonKeywords.some(kw => summary.includes(kw)) || classification.urgency === "Alta";
  }

  async getCloseMessage(reason) {
    if (reason === "has_lawyer") {
      const msg = await BotConfig.findOne({ where: { key: "MSG_ADVOGADO_EXISTENTE" } });
      return msg?.value || "Por ética profissional, não podemos atender.";
    }
    return "Atendimento encerrado. Obrigado!";
  }

  async findTrelloCard(phone) {
    try {
      const response = await trelloClient.get(`/search`, { params: { query: phone, modelTypes: "cards", idBoards: boardId, partial: true } });
      return response.data?.cards?.[0] || null;
    } catch (e) { return null; }
  }

  async addCommentToCard(id, text) {
    await trelloClient.post(`/cards/${id}/actions/comments`, { text });
  }

  async sendWhatsappMessage(phone, msg) {
    await zapiClient.post("/send-text", { phone, message: msg });
  }

  async transcribeAudio(audioUrl) {
    const axios = require("axios");
    const FormData = require("form-data");
    try {
      const audioRes = await axios.get(audioUrl, { responseType: "arraybuffer" });
      const formData = new FormData();
      formData.append("file", Buffer.from(audioRes.data), { filename: "audio.ogg", contentType: "audio/ogg" });
      formData.append("model", "whisper-1");
      formData.append("language", "pt");
      const res = await axios.post("https://api.openai.com/v1/audio/transcriptions", formData, {
        headers: { ...formData.getHeaders(), Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }
      });
      return res.data.text;
    } catch (e) { throw new Error("Whisper failed"); }
  }
}

module.exports = new AutomationService();
