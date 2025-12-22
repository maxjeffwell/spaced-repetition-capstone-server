'use strict';

const axios = require('axios');
const { AI_PROVIDER, AI_LOCAL_URL, AI_CLOUD_URL, AI_API_KEY } = require('../config');

class ChatService {
    constructor() {
        this.provider = AI_PROVIDER;
        this.localUrl = AI_LOCAL_URL;
        this.cloudUrl = AI_CLOUD_URL;
        this.apiKey = AI_API_KEY;
    }

    /**
     * Generates a chat response based on the configured provider.
     * @param {Array} messages - Array of message objects [{role: 'user', content: '...'}]
     * @returns {Promise<Object>} - The AI response content
     */
    async generateResponse(messages) {
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
}

module.exports = new ChatService();
