'use strict';

const axios = require('axios');
const { AI_PROVIDER, AI_LOCAL_URL, AI_CLOUD_URL, AI_GATEWAY_URL, AI_API_KEY } = require('../config');

class ChatService {
    constructor() {
        this.provider = AI_PROVIDER;
        this.localUrl = AI_LOCAL_URL;
        this.cloudUrl = AI_CLOUD_URL;
        this.gatewayUrl = AI_GATEWAY_URL;
        this.apiKey = AI_API_KEY;
    }

    /**
     * Generates a chat response based on the configured provider.
     * @param {Array} messages - Array of message objects [{role: 'user', content: '...'}]
     * @param {Object} context - Optional context for gateway provider
     * @returns {Promise<Object>} - The AI response content
     */
    async generateResponse(messages, context = {}) {
        // Use gateway provider (shared-ai-gateway)
        if (this.provider === 'gateway') {
            return this.generateWithGateway(messages, context);
        }

        const isCloud = this.provider === 'cloud';
        const url = isCloud ? this.cloudUrl : this.localUrl;

        // Prepare headers
        const headers = {
            'Content-Type': 'application/json'
        };

        if (isCloud && this.apiKey) {
            headers['Authorization'] = `Bearer ${this.apiKey}`;
        }

        // Default OpenAI-compatible payload
        // TinyLlama/LlamaCPP supports this format out of the box in server mode
        const payload = {
            messages: messages,
            model: isCloud ? 'gpt-3.5-turbo' : 'tinyllama', // Model name matters less for local, but needed for cloud
            stream: false,
            temperature: 0.7,
            max_tokens: 500
        };

        try {
            console.log(`Sending chat request to ${this.provider} AI at ${url}`);
            const response = await axios.post(url, payload, { headers });

            // Axios automatically tries to parse JSON.
            // The OpenAI format returns data in response.data.choices[0].message
            if (response.data && response.data.choices && response.data.choices.length > 0) {
                return response.data.choices[0].message;
            } else {
                throw new Error('Unexpected response format from AI provider');
            }
        } catch (error) {
            console.error('AI Chat Service Error:', error.message);
            if (error.response) {
                console.error('Response data:', error.response.data);
            }
            throw error;
        }
    }

    /**
     * Generate response using shared-ai-gateway
     * @param {Array} messages - Array of message objects
     * @param {Object} context - Context for the chat (app, userRole, etc.)
     * @returns {Promise<Object>} - The AI response
     */
    async generateWithGateway(messages, context = {}) {
        try {
            console.log(`Sending chat request to gateway at ${this.gatewayUrl}`);

            const response = await axios.post(`${this.gatewayUrl}/api/ai/chat`, {
                messages,
                context: {
                    app: 'intervalai',
                    ...context
                },
                maxTokens: 500,
                temperature: 0.7
            });

            if (response.data && response.data.success) {
                return {
                    role: 'assistant',
                    content: response.data.response
                };
            } else {
                throw new Error('Unexpected response format from gateway');
            }
        } catch (error) {
            console.error('Gateway Chat Service Error:', error.message);
            if (error.response) {
                console.error('Response data:', error.response.data);
            }
            throw error;
        }
    }

    /**
     * Generate study questions from text content using the gateway
     * @param {string} content - Text content to generate questions from
     * @param {number} count - Number of questions to generate
     * @returns {Promise<Array>} - Array of {question, answer} objects
     */
    async generateQuestions(content, count = 5) {
        if (this.provider !== 'gateway') {
            throw new Error('Question generation requires gateway provider');
        }

        try {
            console.log(`Generating ${count} questions from content`);

            const response = await axios.post(`${this.gatewayUrl}/api/ai/generate`, {
                prompt: `Generate ${count} flashcard-style questions from this content:\n\n${content}\n\nFormat each as:\nQ: [question]\nA: [answer]\n\nFocus on key concepts and facts.`,
                app: 'flashcard',
                maxTokens: 800,
                temperature: 0.6
            });

            if (response.data && response.data.success) {
                return this.parseQuestions(response.data.response);
            } else {
                throw new Error('Unexpected response from gateway');
            }
        } catch (error) {
            console.error('Question generation error:', error.message);
            throw error;
        }
    }

    /**
     * Parse Q&A pairs from text response
     * @param {string} text - Raw text response
     * @returns {Array} - Array of {question, answer} objects
     */
    parseQuestions(text) {
        const questions = [];
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
        let currentQ = null;

        for (const line of lines) {
            if (line.match(/^Q(\d*)[:\.]?\s*/i)) {
                if (currentQ && currentQ.question) {
                    questions.push(currentQ);
                }
                currentQ = { question: line.replace(/^Q(\d*)[:\.]?\s*/i, ''), answer: '' };
            } else if (line.match(/^A(\d*)[:\.]?\s*/i) && currentQ) {
                currentQ.answer = line.replace(/^A(\d*)[:\.]?\s*/i, '');
                questions.push(currentQ);
                currentQ = null;
            }
        }

        if (currentQ && currentQ.question) {
            questions.push(currentQ);
        }

        return questions;
    }

    /**
     * Generate a hint for a question the user is struggling with
     * @param {string} question - The question text
     * @param {string} answer - The correct answer
     * @returns {Promise<string>} - A helpful hint
     */
    async generateHint(question, answer) {
        if (this.provider !== 'gateway') {
            throw new Error('Hint generation requires gateway provider');
        }

        try {
            const response = await axios.post(`${this.gatewayUrl}/api/ai/generate`, {
                prompt: `The user is struggling with this flashcard:\nQuestion: ${question}\nCorrect Answer: ${answer}\n\nProvide a helpful hint that guides them toward the answer without giving it away directly. Be concise (1-2 sentences).`,
                app: 'education',
                maxTokens: 100,
                temperature: 0.5
            });

            if (response.data && response.data.success) {
                return response.data.response.trim();
            } else {
                throw new Error('Unexpected response from gateway');
            }
        } catch (error) {
            console.error('Hint generation error:', error.message);
            throw error;
        }
    }
}

module.exports = new ChatService();
