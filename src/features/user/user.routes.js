const express = require('express');
const router = express.Router();
const userController = require('./user.controller');

// Public routes
router.post('/auth/register', userController.register); // Usually restricted, but open for initial setup
router.post('/auth/login', userController.login);

module.exports = router;
