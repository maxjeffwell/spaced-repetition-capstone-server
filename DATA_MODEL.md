# Enhanced Data Model Documentation

## Overview

The data model has been enhanced to support both baseline spaced repetition (SM-2 algorithm) and machine learning-enhanced interval predictions. Every review is tracked for training data collection and performance comparison.

## User Schema

```javascript
{
  _id: ObjectId,
  firstName: String,
  lastName: String,
  username: String (unique),
  password: String (hashed),

  questions: [QuestionSchema],  // Array of vocabulary questions
  head: Number,                 // Index of current question (linked-list head)

  settings: {
    algorithmMode: 'baseline' | 'ml' | 'ab-test',  // Which algorithm to use
    useMLAlgorithm: Boolean,                        // Enable ML predictions
    dailyGoal: Number                               // Target reviews per day
  },

  stats: {
    totalReviews: Number,
    correctAnswers: Number,
    incorrectAnswers: Number,
    currentStreak: Number,      // Days in a row studying
    longestStreak: Number,
    lastStudyDate: Date
  }
}
```

## Question Schema

Each question represents a vocabulary flashcard with comprehensive tracking:

```javascript
{
  _id: ObjectId,
  question: String,              // e.g., "casa" (Spanish word)
  answer: String,                // e.g., "house" (English translation)

  // === BASELINE SR ALGORITHM FIELDS ===
  memoryStrength: Number,        // Current interval in days (default: 1)
  next: Number,                  // Pointer to next question in linked list
  repetitions: Number,           // Consecutive correct answers (SM-2)
  easeFactor: Number,            // SM-2 ease factor (1.3 - 2.5+)

  // === ML-ENHANCED FIELDS ===
  difficultyRating: Number,      // 0-1 scale (calculated from performance)
  reviewHistory: [ReviewHistorySchema],  // All review attempts

  // === STATISTICS ===
  lastReviewed: Date,
  timesCorrect: Number,
  timesIncorrect: Number,
  averageResponseTime: Number,   // milliseconds
  consecutiveCorrect: Number,    // Current streak of correct answers

  // === ML PREDICTIONS ===
  mlRecommendedInterval: Number, // Days (from neural network)
  predictedRetention: Number     // 0-1 probability of recall
}
```

## Review History Schema

Every answer attempt is recorded for ML training and analysis:

```javascript
{
  timestamp: Date,               // When the review occurred
  recalled: Boolean,             // Did user answer correctly?
  responseTime: Number,          // milliseconds to answer
  intervalUsed: Number,          // Days since last review
  algorithmUsed: 'baseline' | 'ml',  // Which algorithm was used
  baselineInterval: Number,      // What baseline predicted
  mlInterval: Number,            // What ML predicted (if available)
  difficulty: Number             // User's perceived difficulty (1-5)
}
```

## Data Flow

### 1. Initial State

```javascript
User creates account
→ 30 Spanish vocabulary cards loaded
→ All cards initialized:
  - memoryStrength = 1 day
  - next = (current_index + 1) % total_cards
  - easeFactor = 2.5
  - difficultyRating = 0.5
  - No review history yet
```

### 2. First Review

```javascript
User answers "casa" → "house"
→ Record review in history:
  {
    timestamp: Date.now(),
    recalled: true,
    responseTime: 3200ms,
    intervalUsed: 1,
    algorithmUsed: 'baseline',
    baselineInterval: 6,    // SM-2 says 6 days
    mlInterval: null        // No ML model yet
  }
→ Update statistics:
  timesCorrect++
  consecutiveCorrect++
  averageResponseTime updated
→ Apply baseline algorithm:
  memoryStrength = 6 days
  repetitions = 1
→ Move in linked list:
  head = current.next
```

### 3. After Collecting Data

```javascript
After ~100 reviews across all cards:
→ Extract training data:
  {
    features: [
      memoryStrength, difficultyRating, timeSinceLastReview,
      successRate, avgResponseTime, totalReviews,
      consecutiveCorrect, timeOfDay
    ],
    label: optimalInterval (from actual retention)
  }
→ Train ML model
→ Enable ML predictions:
  settings.useMLAlgorithm = true
→ Future reviews use ML intervals
```

### 4. A/B Testing Mode

```javascript
When settings.algorithmMode = 'ab-test':
→ For each card, randomly choose algorithm:
  if (card._id % 2 === 0) use baseline
  else use ML
→ Record BOTH predictions:
  baselineInterval: 6 days
  mlInterval: 4 days
  intervalUsed: 4 days  (ML chosen)
→ Compare performance over time
```

## Feature Engineering

For ML model input, we extract 8 features from each question:

```javascript
function createFeatureVector(question) {
  const stats = calculateQuestionStats(question);

  return {
    1. memoryStrength: question.memoryStrength,           // Current interval
    2. difficultyRating: question.difficultyRating,       // 0-1 difficulty
    3. timeSinceLastReview: stats.daysSinceLastReview,   // Days elapsed
    4. successRate: stats.successRate,                    // Historical %
    5. averageResponseTime: stats.averageResponseTime,    // Speed (ms)
    6. totalReviews: stats.totalReviews,                  // Experience
    7. consecutiveCorrect: question.consecutiveCorrect,   // Current streak
    8. timeOfDay: new Date().getHours() / 24             // 0-1 (circadian)
  };
}
```

## Training Data Format

```javascript
{
  // Input Features (8 dimensions)
  memoryStrength: 3,
  difficultyRating: 0.6,
  timeSinceLastReview: 3.2,
  successRate: 0.75,
  averageResponseTime: 2800,
  totalReviews: 8,
  consecutiveCorrect: 2,
  timeOfDay: 0.625,  // 3 PM

  // Output Label
  optimalInterval: 7,  // Next review in 7 days for optimal retention
  wasRetained: true    // Was successfully recalled at next review
}
```

## Linked List Structure

Questions are organized in a circular linked list for efficient review scheduling:

```
head = 0
Questions:
[0] casa     (next=5, memoryStrength=1)  ← head
[1] perro    (next=2, memoryStrength=1)
[2] gato     (next=3, memoryStrength=1)
[3] agua     (next=4, memoryStrength=1)
[4] comida   (next=1, memoryStrength=1)
[5] libro    (next=6, memoryStrength=1)
...

After answering "casa" correctly (interval=6):
head = 5  (moved to casa.next)
[0] casa (next=6, memoryStrength=6) ← 6 positions ahead in queue
```

## Helper Functions

### `calculateQuestionStats(question)`
Computes derived statistics from review history.

### `createFeatureVector(question)`
Prepares ML model input features.

### `updateQuestionStats(question, isCorrect, responseTime)`
Updates all statistics after a review.

### `addReviewToHistory(question, reviewData)`
Records review attempt (keeps last 100 only).

### `getNextQuestion(user)`
Returns question at head of linked list.

### `updateLinkedList(user, questionIndex, interval)`
Moves question forward by `interval` positions.

### `extractTrainingData(users)`
Aggregates review history from all users for ML training.

## Database Indexes

```javascript
// Recommended indexes for performance
db.users.createIndex({ username: 1 }, { unique: true });
db.users.createIndex({ "questions.lastReviewed": 1 });
db.users.createIndex({ "questions.difficultyRating": 1 });
db.users.createIndex({ "settings.algorithmMode": 1 });
```

## Seed Data

Demo user credentials:
- **Username:** demo
- **Password:** password

Includes 30 Spanish vocabulary words from basic to intermediate difficulty.

## Memory Optimization Tracking

To demonstrate memory optimization, we track:

1. **Retention Rate**: % correctly recalled at next review
   - Baseline algorithm
   - ML algorithm

2. **Review Efficiency**: Cards reviewed to achieve 80% retention
   - Baseline: ~X reviews/week
   - ML: ~Y reviews/week (goal: Y < X)

3. **Time to Mastery**: Days until consistent 90%+ retention
   - Baseline: ~Z days
   - ML: ~W days (goal: W < Z)

4. **Personalization**: Variance in intervals across users
   - ML should show higher variance (adapts to individual)
   - Baseline shows uniform intervals

All this data is extracted from `reviewHistory` and aggregated in the dashboard.

---

This enhanced data model provides everything needed to train ML models, compare algorithms, and demonstrate measurable memory optimization!
