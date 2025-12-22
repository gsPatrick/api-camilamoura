const userService = require('./user.service');

class UserController {
    async register(req, res) {
        try {
            const { name, email, password } = req.body;
            const user = await userService.createAdmin(name, email, password);
            res.status(201).json(user);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }

    async login(req, res) {
        try {
            const { email, password } = req.body;
            const data = await userService.login(email, password);
            res.status(200).json(data);
        } catch (error) {
            res.status(401).json({ error: error.message });
        }
    }
}

module.exports = new UserController();
