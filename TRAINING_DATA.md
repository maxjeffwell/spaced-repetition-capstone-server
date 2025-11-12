# Training Data Generation

This file explains how to generate the training data files that are **not tracked in git** (ignored to keep repository size small).

## Missing Training Data Files?

If you've just cloned this repository, you'll need to generate the training data. These files are ignored by git:

- `training-data.json` (~4.6 MB)
- `training-data-clean.json` (~4.6 MB)
- Any other `training-data-*.json` files

## How to Generate Training Data

You have two options for generating training data:

### Option 1: Realistic Simulation (Recommended for Development)

Generate synthetic but realistic training data using the simulation script:

```bash
node scripts/simulate-realistic-reviews.js
```

This creates:
- Realistic user behavior patterns
- Multiple difficulty levels
- Varying retention rates
- ~167,000+ training samples
- Output: `training-data.json` and `training-data-clean.json`

**Advantages:**
- Fast (generates in seconds)
- Reproducible
- Covers diverse scenarios
- No need for actual user data

### Option 2: Extract from Real User Data

If you have a running database with real user interactions:

```bash
node scripts/extract-training-data.js
```

This extracts:
- Actual user review history
- Real learning patterns
- Production usage data

**Advantages:**
- Real-world data
- Better for production model training
- Captures actual user behavior

**Requirements:**
- MongoDB instance with user data
- Sufficient review history (recommend 1000+ reviews)

## Training Data Format

The training data files contain JSON arrays of review records:

```json
[
  {
    "userId": "507f1f77bcf86cd799439011",
    "questionId": "507f1f77bcf86cd799439012",
    "easinessFactor": 2.5,
    "interval": 1,
    "repetitions": 1,
    "consecutiveCorrect": 1,
    "totalReviews": 1,
    "correctReviews": 1,
    "averageResponseTime": 8500,
    "lastInterval": 0,
    "actualInterval": 1.2,
    "performanceRating": 4
  }
]
```

### Files:

- **`training-data.json`**: Raw extracted data with all records
- **`training-data-clean.json`**: Cleaned and preprocessed data ready for training

## Data Cleaning

If you have `training-data.json` but need to clean it:

```bash
node scripts/clean-training-data.js
```

This removes:
- Invalid or incomplete records
- Outliers and anomalies
- Duplicate entries
- Records with missing features

## What Next?

Once you have training data, you can:

1. **Train the ML model**:
   ```bash
   source venv-training/bin/activate
   python scripts/train-model-advanced.py
   ```

2. **Run continuous training**:
   ```bash
   node scripts/continuous-training-pipeline.js
   ```

3. **Test the model**:
   ```bash
   node test/advanced-features.test.js
   ```

## Documentation

For more details, see:
- `TRAINING_DATA_COLLECTION.md` - Detailed data collection methodology
- `ML_TRAINING_GUIDE.md` - Complete training guide
- `CONTINUOUS_TRAINING.md` - Automated training pipeline
- `ml/README.md` - Model files and architecture

## Quick Start (No Training Data Needed)

If you want to run the server without ML features:

The server will work without training data, falling back to the baseline SM-2 algorithm. ML predictions will be disabled until you train a model with training data.
