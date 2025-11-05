'use strict';

const mongoose = require('mongoose');

// Spanish vocabulary for language learning
const spanishVocabulary = [
  { question: 'casa', answer: 'house' },
  { question: 'perro', answer: 'dog' },
  { question: 'gato', answer: 'cat' },
  { question: 'agua', answer: 'water' },
  { question: 'comida', answer: 'food' },
  { question: 'libro', answer: 'book' },
  { question: 'escuela', answer: 'school' },
  { question: 'amigo', answer: 'friend' },
  { question: 'familia', answer: 'family' },
  { question: 'tiempo', answer: 'time' },
  { question: 'día', answer: 'day' },
  { question: 'noche', answer: 'night' },
  { question: 'sol', answer: 'sun' },
  { question: 'luna', answer: 'moon' },
  { question: 'estrella', answer: 'star' },
  { question: 'mar', answer: 'sea' },
  { question: 'montaña', answer: 'mountain' },
  { question: 'río', answer: 'river' },
  { question: 'árbol', answer: 'tree' },
  { question: 'flor', answer: 'flower' },
  { question: 'mesa', answer: 'table' },
  { question: 'silla', answer: 'chair' },
  { question: 'puerta', answer: 'door' },
  { question: 'ventana', answer: 'window' },
  { question: 'calle', answer: 'street' },
  { question: 'ciudad', answer: 'city' },
  { question: 'país', answer: 'country' },
  { question: 'mundo', answer: 'world' },
  { question: 'vida', answer: 'life' },
  { question: 'amor', answer: 'love' }
];

// Initialize questions with proper linked-list structure
function createQuestions() {
  const questions = spanishVocabulary.map((vocab, index) => ({
    _id: new mongoose.Types.ObjectId(),
    question: vocab.question,
    answer: vocab.answer,
    memoryStrength: 1,
    next: (index + 1) % spanishVocabulary.length,
    repetitions: 0,
    easeFactor: 2.5,
    difficultyRating: 0.5,
    reviewHistory: [],
    lastReviewed: null,
    timesCorrect: 0,
    timesIncorrect: 0,
    averageResponseTime: 0,
    consecutiveCorrect: 0,
    mlRecommendedInterval: null,
    predictedRetention: null
  }));

  return questions;
}

module.exports = createQuestions;
