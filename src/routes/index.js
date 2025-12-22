const express = require('express');
const router = express.Router();

const userRoutes = require('../features/user/user.routes');
const automationController = require('../features/automation/automation.controller');
const configRoutes = require('../features/config/config.routes');

router.use('/', userRoutes);
router.post('/webhook/zapi', automationController.handleWebhook);
router.use('/', configRoutes); // Config routes are protected inside the file or here.

module.exports = router;
