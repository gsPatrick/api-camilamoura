require('dotenv').config();
const { trelloClient } = require('./src/config/apiClients');

async function testTrello() {
    const boardId = process.env.TRELLO_BOARD_ID;
    console.log(`Testing Trello Connection for Board ID: ${boardId}...`);

    try {
        const response = await trelloClient.get(`/boards/${boardId}/lists`);
        console.log('\n✅ Connection Successful! Found Lists:');
        console.table(response.data.map(list => ({
            ID: list.id,
            Name: list.name
        })));
    } catch (error) {
        console.error('❌ Error fetching lists:', error.message);
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', error.response.data);
        }
    }
}

testTrello();
