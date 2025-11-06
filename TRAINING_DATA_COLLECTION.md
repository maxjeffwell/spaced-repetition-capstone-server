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

### Method 2: Simple Simulation (Quick Testing)

Use the basic simulation script for quick testing:

```bash
# Simulate 50 reviews with ~75% accuracy
node scripts/simulate-reviews.js 50

# Run multiple batches to build up data
node scripts/simulate-reviews.js 100
```

**Limitations**: All reviews happen within seconds (not realistic time gaps).

### Method 3: Realistic Simulation (Recommended for Training)

Use the improved simulation script for high-quality training data:

```bash
# Quick test (reviews spread over seconds)
node scripts/simulate-realistic-reviews.js --mode=fast --users=1 --sessions=5

# Production training data (reviews spread over 60 days)
node scripts/simulate-realistic-reviews.js --users=5 --sessions=15 --days=60

# Custom configuration
node scripts/simulate-realistic-reviews.js \
  --users=3 \
  --sessions=20 \
  --reviews=8 \
  --days=90 \
  --mode=realistic
```

**Options:**
- `--users=N` - Number of simulated users (default: 3)
- `--sessions=N` - Study sessions per user (default: 10)
- `--reviews=N` - Reviews per session (default: 5)
- `--days=N` - Days to spread simulation over (default: 30)
- `--mode=MODE` - 'fast' (seconds) or 'realistic' (days) (default: realistic)

**Features:**
- ✅ **Multiple learning profiles**: Fast, average, slow, inconsistent, motivated learners
- ✅ **Forgetting curve**: Uses Ebbinghaus exponential decay (R(t) = e^(-t/S))
- ✅ **Realistic time gaps**: Reviews spread over days/weeks (not seconds)
- ✅ **Difficulty correlation**: Response time varies with difficulty
- ✅ **Session patterns**: Simulates study sessions with realistic spacing
- ✅ **Performance variation**: Learners improve over time (or don't)
- ✅ **Direct MongoDB writes**: Much faster than API calls

**Learning Profiles:**

| Profile | Accuracy | Speed | Retention | Notes |
|---------|----------|-------|-----------|-------|
| Fast Learner | 85% | Fast (0.7x) | +15% bonus | Quick, accurate recall |
| Average Learner | 70% | Normal (1.0x) | Baseline | Typical performance |
| Slow Learner | 55% | Slow (1.5x) | -10% penalty | Struggles with retention |
| Inconsistent | 65% | Slow (1.2x) | Variable | High variance in performance |
| Motivated | 75% | Fast (0.9x) | +10% bonus | Improves over time |

**Example Output:**

```bash
$ node scripts/simulate-realistic-reviews.js --users=3 --sessions=10

============================================================
Realistic Training Data Simulation
============================================================

Configuration:
  Users: 3
  Sessions per user: 10
  Reviews per session: 5
  Time mode: realistic
  Time span: 30 days

Creating 3 simulated users...
  Created new user: sim_fast_learner_1
  Created new user: sim_average_learner_2
  Created new user: sim_slow_learner_3

📚 Simulating 10 sessions for sim_fast_learner_1...
  ✓ Completed 50 reviews (86% accuracy)

📚 Simulating 10 sessions for sim_average_learner_2...
  ✓ Completed 50 reviews (71% accuracy)

📚 Simulating 10 sessions for sim_slow_learner_3...
  ✓ Completed 50 reviews (57% accuracy)

============================================================
Simulation Complete!
============================================================

Results by User:
  sim_fast_learner_1: 50 reviews, 86% accuracy
  sim_average_learner_2: 50 reviews, 71% accuracy
  sim_slow_learner_3: 50 reviews, 57% accuracy

Totals:
  150 total reviews
  71% overall accuracy
  3 users with review history

✓ Training data ready for extraction:
  node scripts/extract-training-data.js training-data.json
```

## Extracting Training Data

Once you have enough reviews (recommended: 100+), extract the training data:

```bash
# Extract to training-data.json
node scripts/extract-training-data.js training-data.json

# Check statistics
node scripts/extract-training-data.js
```

## Synthetic Data Augmentation

If you have limited real user data (<100 samples), you can augment your dataset with high-quality synthetic samples using the Google Colab notebook.

### When to Use Synthetic Data

**Use synthetic augmentation when:**
- You have <100 real review samples
- You want to improve model generalization
- You're in the early stages without many users

**Skip augmentation when:**
- You have 500+ real samples (sufficient data)
- You want to avoid overfitting to synthetic patterns

### How Synthetic Data Generation Works

The Colab notebook includes a SMOTE-like (Synthetic Minority Over-sampling Technique) implementation:

1. **Nearest Neighbor Selection**: Finds similar training samples
2. **Interpolation**: Creates new samples between existing ones
3. **Controlled Noise**: Adds small variations for diversity
4. **Statistical Preservation**: Maintains feature distributions

```python
# In Google Colab notebook (Cell 4b)

# Enable synthetic data generation
USE_SYNTHETIC_DATA = True
AUGMENTATION_RATIO = 2.0  # 2x real samples

# This will:
# - Take your 50 real samples
# - Generate 100 synthetic samples (2.0x ratio)
# - Result: 150 total training samples
```

### Recommended Augmentation Ratios

| Real Samples | Augmentation Ratio | Total Samples |
|--------------|-------------------|---------------|
| 20-50        | 5.0x              | 120-300       |
| 50-100       | 3.0x              | 200-400       |
| 100-200      | 2.0x              | 300-600       |
| 200-500      | 1.0x              | 400-1000      |
| 500+         | 0x (none)         | 500+          |

### What Gets Generated

Synthetic samples maintain realistic properties:

**Base features** (interpolated):
- Memory strength variations (e.g., 3 days → 5 days)
- Difficulty ratings (e.g., 0.3 → 0.4)
- Success rates (e.g., 75% → 80%)

**Advanced features** (automatically computed):
- Forgetting curve features
- Interaction terms
- Polynomial features
- All 51 features are recalculated

**Labels** (interpolated):
- Optimal interval predictions
- Maintains relationship to features

### Quality Assurance

The synthetic generation includes safeguards:

✅ **Statistical validity**: Samples stay within realistic ranges
✅ **Feature relationships**: Maintains correlations
✅ **Diversity**: Adds controlled noise (1% of feature std)
✅ **No overfitting**: Uses k-nearest neighbors (k=5)

### Using Synthetic Data in Training

```bash
# 1. Extract real data from MongoDB
node scripts/extract-training-data.js training-data.json

# 2. Upload to Google Colab
# - Open colab_training_notebook.ipynb
# - Cell 4b: Set USE_SYNTHETIC_DATA = True
# - Cell 4b: Set AUGMENTATION_RATIO = 3.0 (adjust as needed)
# - Run all cells

# 3. Download trained model
# 4. Deploy to server
```

### Limitations & Considerations

**Synthetic data cannot:**
- Replace real user behavior patterns
- Capture unforeseen edge cases
- Model long-term retention accurately

**Best practices:**
- Start with augmentation, collect real data in parallel
- Reduce augmentation ratio as real data grows
- Retrain monthly with new real data
- Monitor performance on held-out real samples

### Validation Strategy

When using synthetic data, always validate on **real data only**:

```python
# In Colab notebook
# The train/test split happens AFTER augmentation
# So test set includes both real and synthetic samples

# For proper validation:
# 1. Keep original real data separate: X_real_holdout, y_real_holdout
# 2. Augment remaining data for training
# 3. Evaluate final model on X_real_holdout (pure real data)
```

### Tracking Data Sources

The Colab notebook tracks augmentation in metadata:

```json
{
  "modelVersion": "1.0.0",
  "trainingSize": 380,
  "testSize": 95,
  "dataComposition": {
    "realSamples": 127,
    "syntheticSamples": 253,
    "augmentationRatio": 2.0
  }
}
```

This helps document how much of your training relied on synthetic vs. real data.

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
