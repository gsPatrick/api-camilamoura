const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const BotConfig = sequelize.define('BotConfig', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    key: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: 'Ex: PROMPT_SISTEMA, AVISO_ETICO',
    },
    value: {
        type: DataTypes.TEXT,
        allowNull: false,
    },
}, {
    tableName: 'bot_configs',
    timestamps: true,
    indexes: [
        { unique: true, fields: ['key'] }
    ]
});

module.exports = BotConfig;
