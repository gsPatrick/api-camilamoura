require('dotenv').config();
const BotConfig = require('./src/models/botConfig');
const sequelize = require('./src/config/database');

async function checkState() {
    try {
        await sequelize.authenticate();
        const output = [];

        const configs = await BotConfig.findAll();
        console.log('--- Current BotConfigs ---');
        configs.forEach(c => {
            console.log(`${c.key}: ${c.value.substring(0, 50)}...`);
            output.push(`${c.key} exists.`);
        });

        if (configs.length === 0) {
            console.log('⚠️  NO CONFIGURATIONS FOUND! Table is empty.');
        }

    } catch (e) {
        console.error(e);
    } finally {
        await sequelize.close();
    }
}

checkState();
