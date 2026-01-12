'use strict';

const express = require('express');
const router = express.Router();
const chatService = require('../ml/chat-service');
const passport = require('passport');

// Protect all routes with JWT strategy
router.use('/', passport.authenticate('jwt', { session: false, failWithError: true }));

// POST /chat - General chat with AI
router.post('/', async (req, res, next) => {
    try {
        const { messages } = req.body;

        if (!messages || !Array.isArray(messages)) {
            const err = new Error('Missing or invalid "messages" array in request body');
            err.status = 400;
            return next(err);
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
            const err = new Error('Missing or invalid "content" string in request body');
            err.status = 400;
            return next(err);
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
            const err = new Error('Missing "question" or "answer" in request body');
            err.status = 400;
            return next(err);
        }

        const hint = await chatService.generateHint(question, answer);
        res.json({ success: true, hint });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
