const express = require('express');
const router = express.Router();
const multer = require('multer');
const pdfParse = require('pdf-parse');
const KnowledgeBase = require('../../models/knowledgeBase');
const authMiddleware = require('../user/auth.middleware');

// Configuração do multer para upload de PDFs
const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Apenas arquivos PDF são aceitos'), false);
        }
    }
});

// GET - Listar todos os documentos da base de conhecimento
router.get('/knowledge', authMiddleware, async (req, res) => {
    try {
        const documents = await KnowledgeBase.findAll({
            attributes: ['id', 'title', 'fileName', 'category', 'isActive', 'createdAt', 'summary'],
            order: [['createdAt', 'DESC']]
        });
        res.json(documents);
    } catch (error) {
        console.error('Error fetching knowledge base:', error);
        res.status(500).json({ error: 'Erro ao buscar documentos' });
    }
});

// POST - Upload de novo PDF
router.post('/knowledge/upload', authMiddleware, upload.single('pdf'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Nenhum arquivo enviado' });
        }

        const { title, category } = req.body;

        // Extrai texto do PDF
        let extractedText = '';
        try {
            const pdfData = await pdfParse(req.file.buffer);
            extractedText = pdfData.text;
        } catch (pdfError) {
            console.error('Error parsing PDF:', pdfError);
            extractedText = '[Erro ao extrair texto do PDF]';
        }

        // Cria resumo (primeiros 500 caracteres)
        const summary = extractedText.substring(0, 500) + (extractedText.length > 500 ? '...' : '');

        const document = await KnowledgeBase.create({
            title: title || req.file.originalname,
            fileName: req.file.originalname,
            content: extractedText,
            summary,
            category: category || 'geral',
            isActive: true
        });

        res.status(201).json({
            id: document.id,
            title: document.title,
            fileName: document.fileName,
            category: document.category,
            summary: document.summary,
            message: 'Documento adicionado à base de conhecimento'
        });
    } catch (error) {
        console.error('Error uploading PDF:', error);
        res.status(500).json({ error: 'Erro ao processar o PDF' });
    }
});

// PUT - Atualizar documento
router.put('/knowledge/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { title, category, isActive } = req.body;

        const document = await KnowledgeBase.findByPk(id);
        if (!document) {
            return res.status(404).json({ error: 'Documento não encontrado' });
        }

        await document.update({
            title: title ?? document.title,
            category: category ?? document.category,
            isActive: isActive ?? document.isActive
        });

        res.json({ message: 'Documento atualizado', document });
    } catch (error) {
        console.error('Error updating document:', error);
        res.status(500).json({ error: 'Erro ao atualizar documento' });
    }
});

// DELETE - Remover documento
router.delete('/knowledge/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const document = await KnowledgeBase.findByPk(id);

        if (!document) {
            return res.status(404).json({ error: 'Documento não encontrado' });
        }

        await document.destroy();
        res.json({ message: 'Documento removido' });
    } catch (error) {
        console.error('Error deleting document:', error);
        res.status(500).json({ error: 'Erro ao remover documento' });
    }
});

// GET - Obter contexto completo para a IA (usado internamente)
router.get('/knowledge/context', async (req, res) => {
    try {
        const activeDocuments = await KnowledgeBase.findAll({
            where: { isActive: true },
            attributes: ['title', 'content', 'category']
        });

        const context = activeDocuments.map(doc =>
            `=== ${doc.title} (${doc.category}) ===\n${doc.content}`
        ).join('\n\n');

        res.json({ context, count: activeDocuments.length });
    } catch (error) {
        console.error('Error getting context:', error);
        res.status(500).json({ error: 'Erro ao obter contexto' });
    }
});

module.exports = router;
