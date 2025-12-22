require('dotenv').config({ path: __dirname + '/../../.env' });
const axios = require('axios');
const BotConfig = require('../models/botConfig');

// Helper to get config securely with fallback
async function getConfig(key, envVar) {
    try {
        const conf = await BotConfig.findOne({ where: { key } });
        if (conf && conf.value) return conf.value;
    } catch (e) {
        // console.warn(`Error fetching config ${key}, using fallback.`);
    }
    return process.env[envVar];
}

// --- Z-API Client ---
const zapiClient = axios.create({
    headers: { 'Content-Type': 'application/json' }
});

zapiClient.interceptors.request.use(async (config) => {
    const instanceId = await getConfig('ZAPI_INSTANCE_ID', 'ZAPI_INSTANCE_ID');
    const token = await getConfig('ZAPI_TOKEN', 'ZAPI_TOKEN');
    const clientToken = await getConfig('ZAPI_CLIENT_TOKEN', 'ZAPI_CLIENT_TOKEN');

    if (!instanceId || !token) throw new Error('Z-API Credentials missing (DB or Env).');

    // Reconstruct baseURL dynamically
    config.baseURL = `https://api.z-api.io/instances/${instanceId}/token/${token}`;

    if (clientToken) {
        config.headers['Client-Token'] = clientToken;
    }

    return config;
});


// --- Trello Client ---
const trelloClient = axios.create({
    baseURL: 'https://api.trello.com/1',
});

trelloClient.interceptors.request.use(async (config) => {
    const key = await getConfig('TRELLO_KEY', 'TRELLO_KEY');
    const token = await getConfig('TRELLO_TOKEN', 'TRELLO_TOKEN');

    config.params = config.params || {};
    config.params.key = key;
    config.params.token = token;

    return config;
});


// --- OpenAI Client ---
const openaiClient = axios.create({
    baseURL: 'https://api.openai.com/v1',
    headers: { 'Content-Type': 'application/json' }
});

openaiClient.interceptors.request.use(async (config) => {
    const apiKey = await getConfig('OPENAI_API_KEY', 'OPENAI_API_KEY');
    config.headers.Authorization = `Bearer ${apiKey}`;
    return config;
});

module.exports = {
    zapiClient,
    trelloClient,
    openaiClient,
};
