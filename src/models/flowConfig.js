const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const FlowConfig = sequelize.define('FlowConfig', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    // Modo de operação: MANUAL (perguntas fixas), AI_FIXED (IA com X perguntas), AI_DYNAMIC (IA decide)
    mode: {
        type: DataTypes.ENUM('MANUAL', 'AI_FIXED', 'AI_DYNAMIC'),
        defaultValue: 'AI_DYNAMIC'
    },
    // Quantidade de perguntas (para AI_FIXED)
    aiQuestionCount: {
        type: DataTypes.INTEGER,
        defaultValue: 3
    },
    // Máximo de perguntas (para AI_DYNAMIC, default 5-7)
    aiMaxQuestions: {
        type: DataTypes.INTEGER,
        defaultValue: 5
    },
    // Ação após triagem: AI_RESPONSE (IA continua), WAIT_CONTACT (encerra)
    postAction: {
        type: DataTypes.ENUM('AI_RESPONSE', 'WAIT_CONTACT'),
        defaultValue: 'WAIT_CONTACT'
    },
    // Template do título do card Trello (ex: "{nome}: {telefone}")
    trelloTitleTemplate: {
        type: DataTypes.STRING,
        defaultValue: '{nome}: {telefone}'
    },
    // Template da descrição do card Trello
    trelloDescTemplate: {
        type: DataTypes.TEXT,
        defaultValue: '**Área:** {area}\n**Telefone:** {telefone}\n**Resumo:** {resumo}\n\n---\n**Relato Original:**\n{relato}'
    },
    // Se este fluxo está ativo
    isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    }
}, {
    tableName: 'flow_configs',
    timestamps: true,
});

module.exports = FlowConfig;
