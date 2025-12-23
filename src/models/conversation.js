const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Conversation = sequelize.define('Conversation', {
    phone: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
    },
    // Estado do fluxo: INITIAL, COLLECTING, PROCESSING, AI_CHAT, CLOSED
    step: {
        type: DataTypes.ENUM('INITIAL', 'COLLECTING', 'PROCESSING', 'AI_CHAT', 'CLOSED'),
        defaultValue: 'INITIAL',
    },
    // Nome do cliente
    clientName: {
        type: DataTypes.STRING,
        allowNull: true
    },
    // Índice da pergunta atual (para modo MANUAL)
    currentQuestionIndex: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    // Respostas coletadas (JSON: { "nome": "João", "situacao": "...", ... })
    responses: {
        type: DataTypes.TEXT,
        allowNull: true,
        get() {
            const raw = this.getDataValue('responses');
            return raw ? JSON.parse(raw) : {};
        },
        set(value) {
            this.setDataValue('responses', JSON.stringify(value));
        }
    },
    // Histórico de mensagens para contexto da IA (JSON array)
    messageHistory: {
        type: DataTypes.TEXT,
        allowNull: true,
        get() {
            const raw = this.getDataValue('messageHistory');
            return raw ? JSON.parse(raw) : [];
        },
        set(value) {
            this.setDataValue('messageHistory', JSON.stringify(value));
        }
    },
    // Contador de perguntas feitas pela IA
    aiQuestionCount: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    // Última mensagem raw
    lastMessageRaw: {
        type: DataTypes.TEXT,
        allowNull: true
    }
}, {
    tableName: 'conversations',
    timestamps: true,
});

module.exports = Conversation;


