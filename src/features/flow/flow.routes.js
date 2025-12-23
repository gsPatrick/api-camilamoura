const express = require('express');
const router = express.Router();
const FlowConfig = require('../../models/flowConfig');
const FlowQuestion = require('../../models/flowQuestion');
const authMiddleware = require('../../middleware/auth');

// GET - Obter configuração de fluxo atual
router.get('/flow-config', authMiddleware, async (req, res) => {
    try {
        let config = await FlowConfig.findOne({ where: { isActive: true } });

        // Se não existir, cria com defaults
        if (!config) {
            config = await FlowConfig.create({});
        }

        // Busca perguntas associadas
        const questions = await FlowQuestion.findAll({
            where: { flowConfigId: config.id },
            order: [['order', 'ASC']]
        });

        res.json({
            ...config.toJSON(),
            questions
        });
    } catch (error) {
        console.error('Error fetching flow config:', error);
        res.status(500).json({ error: 'Erro ao buscar configuração de fluxo' });
    }
});

// PUT - Atualizar configuração de fluxo
router.put('/flow-config', authMiddleware, async (req, res) => {
    try {
        const { mode, aiQuestionCount, aiMaxQuestions, postAction, trelloTitleTemplate, trelloDescTemplate } = req.body;

        let config = await FlowConfig.findOne({ where: { isActive: true } });

        if (!config) {
            config = await FlowConfig.create({
                mode, aiQuestionCount, aiMaxQuestions, postAction, trelloTitleTemplate, trelloDescTemplate
            });
        } else {
            await config.update({
                mode: mode ?? config.mode,
                aiQuestionCount: aiQuestionCount ?? config.aiQuestionCount,
                aiMaxQuestions: aiMaxQuestions ?? config.aiMaxQuestions,
                postAction: postAction ?? config.postAction,
                trelloTitleTemplate: trelloTitleTemplate ?? config.trelloTitleTemplate,
                trelloDescTemplate: trelloDescTemplate ?? config.trelloDescTemplate
            });
        }

        res.json({ message: 'Configuração atualizada', config });
    } catch (error) {
        console.error('Error updating flow config:', error);
        res.status(500).json({ error: 'Erro ao atualizar configuração' });
    }
});

// POST - Adicionar pergunta
router.post('/flow-config/questions', authMiddleware, async (req, res) => {
    try {
        const { question, variableName, order, isRequired } = req.body;

        // Garante que existe um config
        let config = await FlowConfig.findOne({ where: { isActive: true } });
        if (!config) {
            config = await FlowConfig.create({});
        }

        // Determina próxima ordem se não especificada
        let nextOrder = order;
        if (nextOrder === undefined) {
            const lastQ = await FlowQuestion.findOne({
                where: { flowConfigId: config.id },
                order: [['order', 'DESC']]
            });
            nextOrder = lastQ ? lastQ.order + 1 : 0;
        }

        const newQuestion = await FlowQuestion.create({
            flowConfigId: config.id,
            question,
            variableName,
            order: nextOrder,
            isRequired: isRequired ?? true
        });

        res.status(201).json(newQuestion);
    } catch (error) {
        console.error('Error adding question:', error);
        res.status(500).json({ error: 'Erro ao adicionar pergunta' });
    }
});

// PUT - Atualizar pergunta
router.put('/flow-config/questions/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { question, variableName, order, isRequired } = req.body;

        const q = await FlowQuestion.findByPk(id);
        if (!q) {
            return res.status(404).json({ error: 'Pergunta não encontrada' });
        }

        await q.update({
            question: question ?? q.question,
            variableName: variableName ?? q.variableName,
            order: order ?? q.order,
            isRequired: isRequired ?? q.isRequired
        });

        res.json(q);
    } catch (error) {
        console.error('Error updating question:', error);
        res.status(500).json({ error: 'Erro ao atualizar pergunta' });
    }
});

// DELETE - Remover pergunta
router.delete('/flow-config/questions/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const q = await FlowQuestion.findByPk(id);

        if (!q) {
            return res.status(404).json({ error: 'Pergunta não encontrada' });
        }

        await q.destroy();
        res.json({ message: 'Pergunta removida' });
    } catch (error) {
        console.error('Error deleting question:', error);
        res.status(500).json({ error: 'Erro ao remover pergunta' });
    }
});

// PUT - Reordenar perguntas
router.put('/flow-config/questions-order', authMiddleware, async (req, res) => {
    try {
        const { questionIds } = req.body; // Array de IDs na nova ordem

        for (let i = 0; i < questionIds.length; i++) {
            await FlowQuestion.update(
                { order: i },
                { where: { id: questionIds[i] } }
            );
        }

        res.json({ message: 'Ordem atualizada' });
    } catch (error) {
        console.error('Error reordering questions:', error);
        res.status(500).json({ error: 'Erro ao reordenar' });
    }
});

// POST - Preview do card Trello (simula como ficará)
router.post('/flow-config/preview', authMiddleware, async (req, res) => {
    try {
        const { trelloTitleTemplate, trelloDescTemplate, sampleData } = req.body;

        // Dados de exemplo se não fornecidos
        const data = sampleData || {
            nome: 'Maria Silva',
            telefone: '5571999887766',
            area: 'Previdenciário',
            resumo: 'Solicitação de aposentadoria por invalidez',
            relato: 'Estou afastada do trabalho há 2 anos por problemas cardíacos...',
            urgencia: 'Normal'
        };

        // Substitui variáveis no template
        let title = trelloTitleTemplate || '{nome}: {telefone}';
        let desc = trelloDescTemplate || '**Área:** {area}\n**Telefone:** {telefone}\n**Resumo:** {resumo}';

        Object.keys(data).forEach(key => {
            const regex = new RegExp(`\\{${key}\\}`, 'gi');
            title = title.replace(regex, data[key]);
            desc = desc.replace(regex, data[key]);
        });

        res.json({
            preview: {
                title,
                description: desc
            },
            availableVariables: Object.keys(data)
        });
    } catch (error) {
        console.error('Error generating preview:', error);
        res.status(500).json({ error: 'Erro ao gerar preview' });
    }
});

module.exports = router;
