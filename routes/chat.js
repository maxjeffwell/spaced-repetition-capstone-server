'use strict';

const express = require('express');
const router = express.Router();
const chatService = require('../ml/chat-service');
const { BadRequestError } = require('../utils/errors');
const { requireAuth } = require('../middleware/cookie-auth');

// Protect all routes with cookie-based authentication
router.use('/', requireAuth);

// POST /chat - General chat with AI
router.post('/', async (req, res, next) => {
    try {
        const { messages } = req.body;

        if (!messages || !Array.isArray(messages)) {
            throw new BadRequestError('Missing or invalid "messages" array in request body');
        }

        const aiResponse = await chatService.generateResponse(messages);
        res.json(aiResponse);
    } catch (err) {
        next(err);
    }
});

// POST /chat/questions - Generate flashcard questions from content
router.post('/questions', async (req, res, next) => {
    try {
        const { content, count } = req.body;

        if (!content || typeof content !== 'string') {
            throw new BadRequestError('Missing or invalid "content" string in request body');
        }

        const questions = await chatService.generateQuestions(content, count || 5);
        res.json({ success: true, questions });
    } catch (err) {
        next(err);
    }
});

// POST /chat/hint - Generate a hint for a question
router.post('/hint', async (req, res, next) => {
    try {
        const { question, answer } = req.body;

        if (!question || !answer) {
            throw new BadRequestError('Missing "question" or "answer" in request body');
        }

        const hint = await chatService.generateHint(question, answer);
        res.json({ success: true, hint });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
