require('dotenv').config();
const BotConfig = require('./src/models/botConfig');
const sequelize = require('./src/config/database');

const defaults = [
    {
        key: 'AVISO_ETICO',
        value: 'Olá! Sou a assistente virtual da Dra. Camila. ⚖️\n\nAntes de prosseguirmos, informo que este canal é monitorado e suas informações serão triadas pela nossa inteligência artificial. \n\nPor favor, descreva seu caso detalhadamente.'
    },
    {
        key: 'MSG_PRESENCIAL',
        value: 'Identifiquei que seu caso pode ter urgência ou prazos curtos. 🚨\n\nRecomendamos fortemente que você agende uma visita presencial ou ligue imediatamente para nosso escritório no número (XX) XXXXX-XXXX.'
    },
    {
        key: 'PROMPT_SISTEMA_BASE',
        value: `Você é uma Assistente Jurídica Senior do escritório da Dra. Camila.
Sua função NÃO é dar conselhos legais, mas sim TRIAR e CLASSIFICAR o relato do cliente.
Analise o relato e extraia as informações no formato JSON.`
    },
    {
        key: 'SPECIALTIES_JSON',
        value: JSON.stringify([
            { id: 1, name: 'BPC/LOAS', keywords: 'idoso, deficiente, loas, bpc', rules: 'Idosos > 65 anos ou Deficientes.', urgent: false },
            { id: 2, name: 'Auxílio Doença', keywords: 'doença, inss, afastamento', rules: 'Problema de saúde que impeça trabalho.', urgent: true },
            { id: 3, name: 'Aposentadoria', keywords: 'tempo, contribuição, idade', rules: 'Tempo de serviço ou idade.', urgent: false }
        ])
    }
];

async function restore() {
    try {
        await sequelize.authenticate();
        console.log('DB Connected.');

        for (const def of defaults) {
            const [item, created] = await BotConfig.findOrCreate({
                where: { key: def.key },
                defaults: def
            });
            if (created) console.log(`Restored ${def.key}`);
            else if (!item.value) {
                // If exists but empty, update
                item.value = def.value;
                await item.save();
                console.log(`Updated empty ${def.key}`);
            } else {
                console.log(`Skipped ${def.key} (Already has value)`);
            }
        }

    } catch (e) {
        console.error(e);
    } finally {
        await sequelize.close();
    }
}

restore();
