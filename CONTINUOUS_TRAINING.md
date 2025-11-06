# Continuous Training & Testing Guide

This guide explains how to continuously improve your ML model through automated testing and retraining.

## Table of Contents

- [Overview](#overview)
- [Automated Pipeline](#automated-pipeline)
- [Scheduling Options](#scheduling-options)
- [Model Versioning](#model-versioning)
- [Performance Monitoring](#performance-monitoring)
- [A/B Testing Strategy](#ab-testing-strategy)

## Overview

Continuous training ensures your ML model improves over time by:

1. **Generating new training data** periodically
2. **Extracting and preparing** data for training
3. **Retraining the model** with updated data
4. **Evaluating performance** against baseline
5. **Deploying improved models** to production

## Automated Pipeline

The `continuous-training-pipeline.js` script automates the training workflow.

### Run Full Pipeline

```bash
# Runs all steps: generate data → extract → report
node scripts/continuous-training-pipeline.js

# Output:
# 📊 Generating new training data...
# 📦 Extracting training data...
# 📈 Current Model Performance...
# ✓ Pipeline completed successfully!
```

### Run Individual Steps

```bash
# Generate only new simulated data
node scripts/continuous-training-pipeline.js --simulate

# Extract training data only
node scripts/continuous-training-pipeline.js --extract

# Generate performance report only
node scripts/continuous-training-pipeline.js --report
```

### What Each Step Does

**1. Data Generation (`--simulate`)**
- Creates new simulated users with realistic patterns
- Spreads reviews over 14 days by default
- Adds to existing training data

**2. Data Extraction (`--extract`)**
- Pulls all reviews from MongoDB
- Engineers 51 features per sample
- Saves timestamped JSON file: `training-data-2025-11-06.json`

**3. Performance Report (`--report`)**
- Shows current model metrics
- Analyzes data statistics
- Provides recommendations for retraining

## Scheduling Options

### Option 1: Manual Periodic Runs (Recommended for Capstone)

Run the pipeline manually every 2-4 weeks:

```bash
# Every few weeks
cd spaced-repetition-capstone-server

# Run pipeline
node scripts/continuous-training-pipeline.js

# Then manually:
# 1. Upload training-data-YYYY-MM-DD.json to Colab
# 2. Train model
# 3. Download and deploy
```

**Best for:**
- Capstone projects
- Demonstrating understanding
- Controlled experiments

### Option 2: Cron Job (Linux/Mac)

Automate data generation and reporting:

```bash
# Edit crontab
crontab -e

# Add line to run weekly on Sundays at 2 AM:
0 2 * * 0 cd /path/to/spaced-repetition-capstone-server && node scripts/continuous-training-pipeline.js >> logs/training-pipeline.log 2>&1

# Or monthly on the 1st at 2 AM:
0 2 1 * * cd /path/to/spaced-repetition-capstone-server && node scripts/continuous-training-pipeline.js >> logs/training-pipeline.log 2>&1
```

**Best for:**
- Production deployments
- Long-running projects
- Automated monitoring

### Option 3: GitHub Actions (CI/CD)

Automate the entire workflow in the cloud:

```yaml
# .github/workflows/retrain-model.yml
name: Retrain ML Model

on:
  schedule:
    # Run monthly on the 1st at 00:00 UTC
    - cron: '0 0 1 * *'
  workflow_dispatch: # Allow manual trigger

jobs:
  generate-and-extract:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm install

      - name: Generate training data
        env:
          MONGODB_URI: ${{ secrets.MONGODB_URI }}
        run: node scripts/continuous-training-pipeline.js --simulate --extract

      - name: Upload training data
        uses: actions/upload-artifact@v3
        with:
          name: training-data
          path: training-data-*.json

      - name: Create issue for manual training
        uses: actions/github-script@v6
        with:
          script: |
            github.rest.issues.create({
              owner: context.repo.owner,
              repo: context.repo.repo,
              title: 'New training data ready',
              body: 'Training data has been generated. Download artifact and train in Colab.'
            })
```

**Best for:**
- Demonstrating DevOps skills
- Automated workflows
- Team projects

### Option 4: Node.js Scheduler (In-App)

Run the pipeline from within your server:

```javascript
// In server.js or separate scheduler file
const cron = require('node-cron');
const { runPipeline } = require('./scripts/continuous-training-pipeline');

// Run every Sunday at 2 AM
cron.schedule('0 2 * * 0', async () => {
  console.log('Starting scheduled training pipeline...');
  await runPipeline({
    generateData: true,
    extract: true,
    report: true
  });
});
```

**Best for:**
- Heroku/Render deployments
- Simple automation
- In-process scheduling

## Model Versioning

Track model versions for rollback and comparison:

### Naming Convention

```
ml/
├── saved-model/              # Current production model
├── models/
│   ├── model-v1.0.0/        # Initial model
│   ├── model-v1.1.0/        # After 2 weeks
│   └── model-v1.2.0/        # After 1 month
```

### Version Before Deploying

```bash
# Before updating production model
cd ml

# Copy current model to versioned folder
cp -r saved-model/ models/model-v$(date +%Y%m%d)/

# Deploy new model
cp ~/Downloads/tfjs_model/* saved-model/

# Commit with version
git add .
git commit -m "Deploy model v1.2.0 - MAE: 5.2 days (90% improvement)"
git push
```

### Rollback If Needed

```bash
# If new model performs worse
cp -r models/model-v20251106/* saved-model/
git add saved-model/
git commit -m "Rollback to model v20251106"
git push
```

## Performance Monitoring

### Generate Performance Report

```bash
node scripts/continuous-training-pipeline.js --report
```

**Sample Output:**

```
============================================================
Continuous Training Report
============================================================

📈 Current Model Performance:
  Version: 1.0.0
  Trained: 11/6/2025
  Test MAE: 6.07 days
  Baseline MAE: 49.31 days
  Improvement: 87.7%
  Training samples: 2,940

📊 Current Data Statistics:
  Users: 7
  Questions: 210
  Total reviews: 925
  Overall accuracy: 49.3%

💡 Recommendations:
  📈 125 new reviews since last training
     Consider retraining to incorporate new data
  📊 Generate more training data (current: 925, target: 500+)

============================================================
```

### Tracking Metrics Over Time

Create a metrics log:

```bash
# Append metrics to log file
node scripts/continuous-training-pipeline.js --report >> logs/model-metrics.log

# View trend
tail -100 logs/model-metrics.log
```

### Metrics to Track

| Metric | Description | Target |
|--------|-------------|--------|
| Test MAE | Average error in days | < 5 days |
| Improvement % | vs baseline SM-2 | > 80% |
| Training samples | Total data size | > 1,000 |
| Model age | Days since training | < 30 days |
| Data coverage | Users with reviews | > 5 users |

## A/B Testing Strategy

Compare baseline vs ML performance in production:

### Enable A/B Testing

```bash
# Via API
curl -X PATCH https://your-app.com/api/questions/settings \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"algorithmMode": "ab-test"}'
```

### Monitor A/B Results

```bash
# Get comparison stats
curl https://your-app.com/api/questions/stats/comparison \
  -H "Authorization: Bearer $TOKEN" | jq
```

**Sample Response:**

```json
{
  "baseline": {
    "avgInterval": 6.5,
    "accuracy": 0.65,
    "totalReviews": 450
  },
  "ml": {
    "avgInterval": 4.2,
    "accuracy": 0.78,
    "totalReviews": 475
  },
  "improvement": {
    "intervalReduction": "35%",
    "accuracyIncrease": "20%"
  }
}
```

### Interpretation

**ML model is better if:**
- ✅ ML accuracy > baseline accuracy
- ✅ Retention rate similar or better
- ✅ Users complete more reviews (better engagement)

**Baseline is better if:**
- ⚠️ ML accuracy < baseline accuracy
- ⚠️ Users quit more often
- ⚠️ Predictions are inconsistent

### Gradual Rollout

```javascript
// Gradually increase ML usage
const mlRatio = 0.5;  // Start with 50% ML, 50% baseline

if (Math.random() < mlRatio) {
  // Use ML prediction
} else {
  // Use baseline SM-2
}

// Monitor for 1 week, then increase to 0.75, then 1.0
```

## Recommended Workflow

### Weekly (5 minutes)

```bash
# Check performance report
node scripts/continuous-training-pipeline.js --report

# Review metrics
# - Is MAE increasing? (model degrading)
# - Are there new reviews? (>100 since last training)
# - Is model > 30 days old?
```

### Bi-weekly (30 minutes)

```bash
# Generate new simulated data
node scripts/continuous-training-pipeline.js --simulate --extract

# Upload to Colab and train
# Download and test locally
# Deploy if improvement > 5%
```

### Monthly (1 hour)

```bash
# Full retraining with fresh data
node scripts/simulate-realistic-reviews.js --users=5 --sessions=20 --days=90
node scripts/extract-training-data.js training-data.json

# Upload to Colab
# Train with synthetic augmentation
# Download and deploy
# Version the model
# Update documentation
```

## Best Practices

### 1. Always Validate Before Deploying

```bash
# Test locally first
npm test  # Run test suite if you have one

# Check model loads
node -e "require('./ml/ml-service').loadModel()"

# Verify metadata
cat ml/saved-model/metadata.json | jq '.performance'
```

### 2. Document Each Retraining

```bash
git commit -m "Retrain model v1.2.0

- Training samples: 3,500 (up from 2,940)
- Test MAE: 5.2 days (improved from 6.07)
- Improvement: 90.1% (up from 87.7%)
- Trained on: 2025-11-20
- Notes: Added 3 new user profiles
"
```

### 3. Keep Training Data Archives

```bash
# Save historical training data
mkdir -p ml/training-data-archive
mv training-data-*.json ml/training-data-archive/

# Compress old data
tar -czf ml/training-data-archive/2025-11.tar.gz ml/training-data-archive/training-data-2025-11-*.json
```

### 4. Monitor Production Performance

```javascript
// Log ML predictions vs actual recall
app.post('/api/questions/answer', async (req, res) => {
  const prediction = mlModel.predict(features);
  const actual = req.body.recalled;

  // Log for monitoring
  logger.info('ML Prediction', {
    predicted: prediction,
    actual: actual,
    error: Math.abs(prediction - actual)
  });
});
```

## Troubleshooting

### Pipeline Fails to Generate Data

**Symptom:** "Cannot connect to MongoDB"

**Solution:**
```bash
# Check MongoDB connection
node -e "require('mongoose').connect(process.env.MONGODB_URI).then(() => console.log('✓ Connected'))"

# Verify .env file
cat .env | grep MONGODB_URI
```

### Model Performance Degrades

**Symptom:** MAE increases over time

**Causes:**
- Data distribution drift (users behave differently)
- Model overfitting to old patterns
- Not enough recent data

**Solution:**
```bash
# Generate fresh data and retrain
node scripts/simulate-realistic-reviews.js --users=10 --sessions=30 --days=120
node scripts/extract-training-data.js training-data.json
# Retrain in Colab with new data
```

### Training Data Becomes Stale

**Symptom:** Model trained > 60 days ago

**Solution:**
- Set up automated reminder (calendar, cron)
- Generate continuous new data weekly
- Retrain monthly minimum

## For Your Capstone

Document your continuous learning approach:

```markdown
## Continuous Improvement Strategy

This project implements continuous learning through:

1. **Automated Data Generation**
   - Weekly simulated user sessions
   - Realistic forgetting curve patterns
   - Multiple learning profiles

2. **Monthly Retraining**
   - Model retrained with accumulated data
   - Performance tracked over time
   - Versioned for rollback capability

3. **A/B Testing**
   - 50/50 split between ML and baseline
   - Monitors accuracy and retention
   - Gradual rollout of improvements

4. **Performance Monitoring**
   - MAE tracked per training cycle
   - Baseline comparison maintained
   - Automated reporting and alerts

See `CONTINUOUS_TRAINING.md` for implementation details.
```

---

**Last Updated**: 2025-11-06
**Pipeline Version**: 1.0.0
