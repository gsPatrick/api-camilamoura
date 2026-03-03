require('dotenv').config();
const User = require('./src/models/user');
const UserService = require('./src/features/user/user.service');
const sequelize = require('./src/config/database');
const bcrypt = require('bcryptjs');

async function debugLogin() {
    try {
        await sequelize.authenticate();
        console.log('DB Connected.');

        const email = 'patrick@gmail.com';
        const pass = 'patrick123';

        const user = await User.findOne({ where: { email } });

        if (!user) {
            console.log('❌ User NOT FOUND. Creating...');
            await UserService.createAdmin('Patrick Admin', email, pass);
            console.log('✅ User Created.');
        } else {
            console.log('✅ User FOUND:', user.email);
            const valid = await bcrypt.compare(pass, user.password);
            console.log(`🔑 Password Check ('${pass}'): ${valid ? 'MATCH' : 'FAIL'}`);

            if (!valid) {
                console.log('⚠️  Password mismatch. Resetting...');
                const hash = await bcrypt.hash(pass, 10);
                user.password = hash;
                await user.save();
                console.log('✅ Password Reset.');
            }
        }

    } catch (e) {
        console.error(e);
    } finally {
        await sequelize.close();
    }
}

debugLogin();
