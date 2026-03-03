const express = require('express');
const router = express.Router();
const configController = require('./config.controller');

// Middleware de checkAuth deve ser injetado aqui depois
// Por enquanto deixarei aberto ou assumirei que será montado com middleware no index.js ou aqui.
// O prompt pede "rotas protegidas". Vou assumir que o middleware JWT está disponível.
// Mas não criei o middleware ainda. Vou criar um middleware de auth simples em src/middlewares/auth.js depois.

const authMiddleware = require('../../middleware/auth');

router.get('/configs', authMiddleware, configController.getAllConfigs);
router.put('/configs', authMiddleware, configController.updateConfigs);
router.get('/trello/board-data', authMiddleware, configController.getTrelloData);

module.exports = router;
