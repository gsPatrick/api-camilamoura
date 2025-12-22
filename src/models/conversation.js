const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Conversation = sequelize.define('Conversation', {
    phone: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
    },
    step: {
        type: DataTypes.ENUM('WAITING_FOR_INPUT', 'PROCESSING'),
        defaultValue: 'WAITING_FOR_INPUT',
    },
    lastMessageRaw: {
        type: DataTypes.TEXT,
        allowNull: true
    }
}, {
    tableName: 'conversations',
    timestamps: true,
});

module.exports = Conversation;
