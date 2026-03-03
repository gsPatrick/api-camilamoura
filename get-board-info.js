require('dotenv').config();
const axios = require('axios');

const TRELLO_KEY = process.env.TRELLO_KEY;
const TRELLO_TOKEN = process.env.TRELLO_TOKEN;
const SHORT_BOARD_ID = 'xAc4IuB2'; // From URL

async function getBoardInfo() {
    try {
        // Get full board info including the real ID
        const boardRes = await axios.get(`https://api.trello.com/1/boards/${SHORT_BOARD_ID}`, {
            params: { key: TRELLO_KEY, token: TRELLO_TOKEN }
        });

        console.log('=== BOARD INFO ===');
        console.log('Full ID:', boardRes.data.id);
        console.log('Name:', boardRes.data.name);
        console.log('');

        // Get all labels
        const labelsRes = await axios.get(`https://api.trello.com/1/boards/${SHORT_BOARD_ID}/labels`, {
            params: { key: TRELLO_KEY, token: TRELLO_TOKEN }
        });

        console.log('=== LABELS ===');
        labelsRes.data.forEach(label => {
            console.log(`- "${label.name}" (ID: ${label.id}) [${label.color}]`);
        });
        console.log('');

        // Get all lists
        const listsRes = await axios.get(`https://api.trello.com/1/boards/${SHORT_BOARD_ID}/lists`, {
            params: { key: TRELLO_KEY, token: TRELLO_TOKEN }
        });

        console.log('=== LISTS ===');
        listsRes.data.forEach(list => {
            console.log(`- "${list.name}" (ID: ${list.id})`);
        });

        console.log('\n=== ENVIRONMENT VARIABLES TO SET ===');
        console.log(`TRELLO_BOARD_ID=${boardRes.data.id}`);

        const checklistList = listsRes.data.find(l => /checklist/i.test(l.name));
        if (checklistList) {
            console.log(`TRELLO_LIST_ID=${checklistList.id}`);
        }

    } catch (error) {
        console.error('Error:', error.response?.data || error.message);
    }
}

getBoardInfo();
