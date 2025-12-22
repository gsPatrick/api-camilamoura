require('dotenv').config();
const http = require('http');
const app = require('./app');
const sequelize = require('./src/config/database');

const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

const UserService = require('./src/features/user/user.service');

async function startServer() {
    try {
        await sequelize.authenticate();
        console.log('Database connection has been established successfully.');

        // Sync models
        await sequelize.sync({ force: true });
        console.log('Database synced.');

        // Create Default Admin User
        try {
            const adminEmail = 'camila@camilamoura.adv.br';
            const adminPass = 'camilacamilamoura.adv.bradmin123';
            const existingUser = await UserService.findUserByEmail(adminEmail);
            if (!existingUser) {
                console.log('Creating default admin user...');
                await UserService.createAdmin('Patrick Admin', adminEmail, adminPass);
                console.log('Default admin user created: patrick@gmail.com');
            }
        } catch (uErr) {
            console.error('Error creating default user:', uErr);
        }

        server.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
        });
    } catch (error) {
        console.error('Unable to connect to the database:', error);
    }
}

startServer();
