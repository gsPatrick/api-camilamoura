const User = require('../../models/user');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

class UserService {
    async createAdmin(name, email, password) {
        const hashedPassword = await bcrypt.hash(password, 10);
        return await User.create({ name, email, password: hashedPassword });
    }

    async login(email, password) {
        const user = await User.findOne({ where: { email } });
        if (!user) {
            throw new Error('Invalid credentials');
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            throw new Error('Invalid credentials');
        }

        const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
            expiresIn: '1d',
        });

        return { token, user: { id: user.id, name: user.name, email: user.email } };
    }

    async findByEmail(email) {
        return await User.findOne({ where: { email } });
    }
}

module.exports = new UserService();
