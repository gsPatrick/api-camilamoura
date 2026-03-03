const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const FlowQuestion = sequelize.define('FlowQuestion', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    // FK para FlowConfig
    flowConfigId: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    // Texto da pergunta (ex: "Qual é o seu nome completo?")
    question: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    // Nome da variável para usar em templates (ex: "nome", "situacao")
    variableName: {
        type: DataTypes.STRING,
        allowNull: false
    },
    // Ordem de exibição
    order: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    // Se é obrigatória
    isRequired: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    }
}, {
    tableName: 'flow_questions',
    timestamps: true,
});

module.exports = FlowQuestion;
