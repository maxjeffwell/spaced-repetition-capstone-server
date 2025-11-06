# Neural-Enhanced Spaced Repetition Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER INTERFACE                          │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────────┐   │
│  │   Learning   │  │  Dashboard   │  │  ML Comparison      │   │
│  │   Session    │  │  (Stats)     │  │  Visualization      │   │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬──────────┘   │
│         │                 │                      │              │
└─────────┼─────────────────┼──────────────────────┼──────────────┘
          │                 │                      │
          ▼                 ▼                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                      REACT FRONTEND                              │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │              Redux Store / State Management                 │ │
│  └────────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │           TensorFlow.js (Client-Side ML Model)             │ │
│  │  • Load pre-trained model                                  │ │
│  │  • Make real-time predictions                              │ │
│  │  • Optional: Federated learning                            │ │
│  └────────────────────────────────────────────────────────────┘ │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            │ REST API
                            │
┌───────────────────────────▼─────────────────────────────────────┐
│                    NODE.JS / EXPRESS SERVER                      │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    API ENDPOINTS                          │  │
│  │  • POST /api/answer    - Submit answer                    │  │
│  │  • GET  /api/question  - Get next question                │  │
│  │  • GET  /api/stats     - Get learning statistics          │  │
│  │  • POST /api/train     - Trigger ML model training        │  │
│  │  • GET  /api/ml-stats  - Compare baseline vs ML           │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │               SPACED REPETITION ENGINE                    │  │
│  │                                                            │  │
│  │  ┌──────────────────┐      ┌──────────────────┐          │  │
│  │  │  Baseline SR     │      │   ML-Enhanced    │          │  │
│  │  │  Algorithm       │      │   SR Algorithm   │          │  │
│  │  │  (SM-2/Leitner)  │      │   (Neural Net)   │          │  │
│  │  └────────┬─────────┘      └────────┬─────────┘          │  │
│  │           │                         │                     │  │
│  │           ├─────────────────────────┤                     │  │
│  │           │  Interval Calculation   │                     │  │
│  │           └─────────────────────────┘                     │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              ML TRAINING SERVICE                          │  │
│  │  • Collect review history data                            │  │
│  │  • Preprocess features                                    │  │
│  │  • Train TensorFlow.js model                              │  │
│  │  • Export model for client                                │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                      MONGODB DATABASE                            │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  Users Collection                                           │ │
│  │  {                                                          │ │
│  │    _id, firstName, lastName, username, password,           │ │
│  │    questions: [                                            │ │
│  │      {                                                      │ │
│  │        _id, question, answer,                              │ │
│  │        memoryStrength: Number,                             │ │
│  │        next: Number,  // linked-list pointer               │ │
│  │        difficultyRating: Number,                           │ │
│  │        reviewHistory: [                                    │ │
│  │          {                                                  │ │
│  │            timestamp: Date,                                │ │
│  │            recalled: Boolean,                              │ │
│  │            responseTime: Number,                           │ │
│  │            intervalUsed: Number,                           │ │
│  │            algorithmUsed: 'baseline' | 'ml',               │ │
│  │            baselineInterval: Number,                       │ │
│  │            mlInterval: Number                              │ │
│  │          }                                                  │ │
│  │        ],                                                   │ │
│  │        lastReviewed: Date,                                 │ │
│  │        timesCorrect: Number,                               │ │
│  │        timesIncorrect: Number                              │ │
│  │      }                                                      │ │
│  │    ],                                                       │ │
│  │    head: Number,                                           │ │
│  │    settings: {                                             │ │
│  │      useMLAlgorithm: Boolean,                              │ │
│  │      algorithmMode: 'baseline' | 'ml' | 'ab-test'         │ │
│  │    }                                                        │ │
│  │  }                                                          │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  Training Data Collection (Aggregated)                     │ │
│  │  • All review history across users                         │ │
│  │  • Used for ML model training                              │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow Diagrams

### 1. Learning Session Flow

```
User Starts Session
       │
       ▼
┌─────────────────┐
│ GET /question   │
│ • Find head     │
│ • Return Q      │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────┐
│   User Answers Question             │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────┐
│  POST /answer { questionId, answer, responseTime }  │
└────────┬────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────┐
│  Server: Check Answer Correctness            │
└────────┬─────────────────────────────────────┘
         │
         ├──────────────┬──────────────┐
         ▼              ▼              ▼
   ┌─────────┐   ┌──────────┐   ┌──────────┐
   │Baseline │   │ML Model  │   │A/B Test  │
   │Algorithm│   │Algorithm │   │Both      │
   └────┬────┘   └────┬─────┘   └────┬─────┘
        │             │               │
        └─────────────┴───────────────┘
                      │
                      ▼
        ┌─────────────────────────────┐
        │ Calculate Next Interval     │
        │ • Baseline: SM-2 formula    │
        │ • ML: Neural net prediction │
        └─────────────┬───────────────┘
                      │
                      ▼
        ┌─────────────────────────────┐
        │ Update Database             │
        │ • Save review history       │
        │ • Update memoryStrength     │
        │ • Adjust linked list        │
        └─────────────┬───────────────┘
                      │
                      ▼
        ┌─────────────────────────────┐
        │ Return Feedback to User     │
        │ • Correct/Incorrect         │
        │ • Next review interval      │
        │ • Statistics                │
        └─────────────────────────────┘
```

### 2. ML Training Pipeline

```
┌─────────────────────────────────────┐
│  Trigger: Manual or Scheduled       │
│  (e.g., nightly cron job)           │
└────────────┬────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────┐
│  Extract Training Data from MongoDB             │
│  • All users' review history                    │
│  • Features: difficulty, history, timing        │
│  • Labels: actual retention outcomes            │
└────────────┬────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────┐
│  Feature Engineering                             │
│  Input features:                                 │
│  • memoryStrength (current)                      │
│  • difficultyRating (0-1)                        │
│  • timeSinceLastReview (days)                    │
│  • successRate (historical %)                    │
│  • averageResponseTime (ms)                      │
│  • totalReviews (count)                          │
│  • consecutiveCorrect (count)                    │
│  • timeOfDay (normalized)                        │
│                                                   │
│  Output label:                                   │
│  • optimalInterval (days)                        │
│    Based on actual retention at next review      │
└────────────┬────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────┐
│  Train TensorFlow.js Model                       │
│                                                   │
│  Architecture:                                    │
│  • Input layer: 8 features                       │
│  • Dense layer 1: 32 neurons, ReLU              │
│  • Dropout: 0.2                                  │
│  • Dense layer 2: 16 neurons, ReLU              │
│  • Dense layer 3: 8 neurons, ReLU               │
│  • Output layer: 1 neuron (interval prediction) │
│                                                   │
│  Loss: Mean Squared Error                        │
│  Optimizer: Adam                                 │
└────────────┬────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────┐
│  Evaluate Model Performance                      │
│  • Test set validation                           │
│  • Compare to baseline SR algorithm              │
│  • Metrics: MAE, RMSE, retention accuracy        │
└────────────┬────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────┐
│  Export Model                                    │
│  • Save to /public/models/sr-model.json         │
│  • Client can load and use for predictions      │
└─────────────────────────────────────────────────┘
```

## Algorithm Comparison

### Baseline: SM-2 Algorithm

```javascript
function calculateSM2Interval(quality, repetitions, easeFactor, interval) {
  // quality: 0-5 (0=complete blackout, 5=perfect recall)
  // repetitions: number of consecutive correct answers
  // easeFactor: difficulty multiplier (starts at 2.5)
  // interval: current interval in days

  if (quality < 3) {
    // Failed - reset
    return {
      interval: 1,
      repetitions: 0,
      easeFactor: easeFactor
    };
  }

  let newEaseFactor = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  if (newEaseFactor < 1.3) newEaseFactor = 1.3;

  let newInterval;
  if (repetitions === 0) {
    newInterval = 1;
  } else if (repetitions === 1) {
    newInterval = 6;
  } else {
    newInterval = Math.round(interval * newEaseFactor);
  }

  return {
    interval: newInterval,
    repetitions: repetitions + 1,
    easeFactor: newEaseFactor
  };
}
```

### ML-Enhanced Algorithm

```javascript
async function calculateMLInterval(question, user) {
  // Prepare features
  const features = {
    memoryStrength: question.memoryStrength,
    difficultyRating: question.difficultyRating,
    timeSinceLastReview: calculateDaysSince(question.lastReviewed),
    successRate: question.timesCorrect / (question.timesCorrect + question.timesIncorrect),
    averageResponseTime: calculateAverageResponseTime(question.reviewHistory),
    totalReviews: question.reviewHistory.length,
    consecutiveCorrect: calculateConsecutiveCorrect(question.reviewHistory),
    timeOfDay: new Date().getHours() / 24
  };

  // Load TensorFlow.js model
  const model = await tf.loadLayersModel('/models/sr-model.json');

  // Make prediction
  const inputTensor = tf.tensor2d([Object.values(features)]);
  const prediction = model.predict(inputTensor);
  const predictedInterval = prediction.dataSync()[0];

  // Clean up
  inputTensor.dispose();
  prediction.dispose();

  return Math.round(predictedInterval);
}
```

## A/B Testing Strategy

```
User Settings:
┌─────────────────────────────────────┐
│  algorithmMode:                     │
│  • 'baseline'  - Always use SM-2    │
│  • 'ml'        - Always use ML      │
│  • 'ab-test'   - Split cards 50/50  │
└─────────────────────────────────────┘

For each question:
  if (algorithmMode === 'ab-test') {
    // Randomly assign to baseline or ML
    algorithmUsed = question._id % 2 === 0 ? 'baseline' : 'ml';
  } else {
    algorithmUsed = algorithmMode;
  }

Store both predictions:
  reviewHistory.push({
    baselineInterval: calculateSM2(...),
    mlInterval: calculateML(...),
    algorithmUsed: algorithmUsed,
    intervalUsed: algorithmUsed === 'baseline' ? baselineInterval : mlInterval
  });
```

## Frontend Components

```
App
├── LoginPage
├── RegistrationPage
└── Dashboard (authenticated)
    ├── HeaderBar
    ├── StatsPanel
    │   ├── ProgressChart
    │   ├── RetentionMetrics
    │   └── AlgorithmComparison
    ├── LearningSession
    │   ├── QuestionCard
    │   ├── AnswerInput
    │   ├── FeedbackDisplay
    │   └── IntervalInfo
    └── MLVisualization
        ├── PerformanceComparison
        │   ├── BaselineStats
        │   └── MLStats
        ├── RetentionCurves
        └── FeatureImportance
```

## API Endpoints

```
Authentication:
POST   /api/auth/login
POST   /api/auth/register
POST   /api/auth/refresh

Questions:
GET    /api/question/next           - Get next question to review
POST   /api/answer                  - Submit answer & get feedback
  Body: { questionId, answer, responseTime }
  Response: {
    correct: boolean,
    correctAnswer: string,
    nextInterval: number,
    algorithmUsed: 'baseline' | 'ml',
    baselineInterval: number,
    mlInterval: number,
    feedback: string
  }

Statistics:
GET    /api/stats                   - Overall learning stats
GET    /api/stats/comparison        - Baseline vs ML comparison
GET    /api/stats/retention-curve   - Retention over time

ML Model:
POST   /api/ml/train                - Trigger model training
GET    /api/ml/model                - Download latest model
GET    /api/ml/metrics              - Model performance metrics

User Settings:
PATCH  /api/user/settings           - Update algorithm mode
  Body: { algorithmMode: 'baseline' | 'ml' | 'ab-test' }
```

## Performance Metrics

```
Metrics to Track:

1. Retention Rate
   • Baseline algorithm: % cards recalled correctly
   • ML algorithm: % cards recalled correctly

2. Learning Efficiency
   • Time to mastery (baseline vs ML)
   • Average review sessions needed

3. User Engagement
   • Session length
   • Cards reviewed per session
   • Dropout rate

4. Model Performance
   • Prediction accuracy (MAE, RMSE)
   • Interval optimization
   • Training/inference time
```

## Technology Stack Summary

```
Frontend:
├── React (UI framework)
├── Redux (state management)
├── TensorFlow.js (client-side ML)
├── Chart.js / D3.js (visualizations)
└── Axios (HTTP client)

Backend:
├── Node.js + Express (server)
├── Mongoose (MongoDB ODM)
├── Passport.js (authentication)
├── TensorFlow.js Node (server-side ML training)
└── node-cron (scheduled training)

Database:
└── MongoDB (user data, questions, review history)

ML:
├── TensorFlow.js (neural network)
├── Model training: Server-side
└── Model inference: Client-side
```

## Development Phases

```
Phase 1: Foundation ✓
├── Set up project structure
├── Implement baseline SR algorithm (SM-2)
└── Build basic Q&A flow

Phase 2: Data Collection
├── Enhanced data model
├── Review history tracking
└── Performance metrics collection

Phase 3: ML Integration
├── Feature engineering
├── Model training pipeline
├── TensorFlow.js integration
└── Prediction endpoint

Phase 4: A/B Testing
├── Algorithm comparison logic
├── Split testing implementation
└── Metrics collection

Phase 5: Visualization
├── Performance dashboard
├── Retention curves
├── Algorithm comparison charts
└── Real-time insights

Phase 6: Optimization
├── Model fine-tuning
├── Performance improvements
└── User experience enhancements
```

---

This architecture provides:
1. ✅ Clear separation of baseline vs ML algorithms
2. ✅ Complete data tracking for training
3. ✅ A/B testing capability
4. ✅ Scalable TensorFlow.js integration
5. ✅ Comprehensive metrics and visualization
6. ✅ Language learning focus with extensibility
