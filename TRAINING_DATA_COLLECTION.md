# Training Data Collection Guide

## Overview

The system automatically collects training data from every review attempt. This data is used to train the ML model for personalized interval predictions.

## How Training Data is Collected

### Automatic Collection

Every time a user submits an answer via `POST /api/questions/answer`, the system automatically records:

- **Timestamp**: When the review occurred
- **Recalled**: Whether the answer was correct
- **Response Time**: Milliseconds to answer
- **Interval Used**: Days since last review
- **Algorithm Used**: 'baseline' or 'ml'
- **Baseline Interval**: What SM-2 predicted
- **ML Interval**: What ML predicted (if available)

This is stored in the `reviewHistory` array for each question in `models/user.js:42-84`.

## Generating Review Data

### Method 1: Manual Testing

Use the API directly to answer questions:

```bash
# 1. Login
TOKEN=$(curl -s -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "demo", "password": "password"}' \
  | jq -r '.authToken')

# 2. Get next question
curl -s http://localhost:8080/api/questions/next \
  -H "Authorization: Bearer $TOKEN" | jq

# 3. Submit answer
curl -s -X POST http://localhost:8080/api/questions/answer \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"answer": "house", "responseTime": 2500}' | jq
```

### Method 2: Automated Simulation (Recommended)

Use the simulation script to generate training data quickly:

```bash
# Simulate 50 reviews with ~75% accuracy
node scripts/simulate-reviews.js 50

# Run multiple batches to build up data
node scripts/simulate-reviews.js 100
```

The script automatically:
- Logs in as demo user
- Gets next question
- Submits answer with realistic response times
- Randomly gets answers correct/incorrect based on target accuracy

## Extracting Training Data

Once you have enough reviews (recommended: 100+), extract the training data:

```bash
# Extract to training-data.json
node scripts/extract-training-data.js training-data.json

# Check statistics
node scripts/extract-training-data.js
```

## Training Data Format

Each training sample contains:

### Features (8 dimensions):
```json
{
  "memoryStrength": 6,          // Current interval (days)
  "difficultyRating": 0.25,     // Historical failure rate (0-1)
  "timeSinceLastReview": 3.2,   // Days elapsed since last review
  "successRate": 0.75,          // Historical success rate (0-1)
  "averageResponseTime": 2800,  // Average speed (ms)
  "totalReviews": 8,            // Number of reviews for this card
  "consecutiveCorrect": 2,      // Current streak
  "timeOfDay": 0.625            // Hour of day normalized (0-1)
}
```

### Label (target):
```json
{
  "recalled": true,             // Was next review successful?
  "actualInterval": 3.5,        // Days until next review
  "optimalInterval": 7          // Calculated optimal interval
}
```

### Metadata:
```json
{
  "userId": "690a9fdf125f70d4fdd3b44f",
  "question": "casa",
  "reviewIndex": 3,
  "timestamp": "2025-11-05T01:06:37.156Z"
}
```

## ML Training Readiness

The system tracks when enough data is available for ML training:

```bash
# Check ML readiness
curl -s http://localhost:8080/api/questions/stats/comparison \
  -H "Authorization: Bearer $TOKEN" | jq '.mlReadiness'
```

Requirements:
- **Minimum 100 total reviews** across all cards
- **Minimum 10 cards** with at least 2 reviews each

## Current Status

After running the simulation scripts:

- ✓ **120+ reviews** completed
- ✓ **90 training samples** extracted
- ✓ **78.9% retention rate**
- ✓ **30 cards** with review history
- ✓ **Ready for ML training**

## Next Steps

Once you have sufficient training data:

1. **Train ML Model** - Use TensorFlow.js to train on the extracted data
2. **Enable ML Mode** - Set `algorithmMode: "ml"` via API
3. **A/B Test** - Compare baseline vs ML performance with `algorithmMode: "ab-test"`
4. **Monitor** - Track retention rates and interval optimization

## Scripts

- `scripts/simulate-reviews.js` - Generate review sessions
- `scripts/extract-training-data.js` - Extract training data from MongoDB
- `utils/question-helpers.js` - Helper functions for data processing

## Data Storage

- **Database**: MongoDB collection `users.questions[].reviewHistory`
- **Export Format**: JSON file with features, labels, and metadata
- **Size Limit**: Last 100 reviews per card (automatically managed)

## Performance Metrics

The system tracks:

- **Retention Rate**: % of reviews recalled successfully
- **Average Interval**: Days between reviews
- **Response Time**: Speed of recall (ms)
- **Consecutive Correct**: Mastery streaks

These metrics are used to evaluate algorithm performance and optimize the ML model.
