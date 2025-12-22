'use strict';

const express = require('express');
const router = express.Router();
const chatService = require('../ml/chat-service');
const passport = require('passport');

// Protect the route with JWT strategy
router.use('/', passport.authenticate('jwt', { session: false, failWithError: true }));

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

module.exports = router;
