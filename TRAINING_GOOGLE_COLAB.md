# ML Model Training Guide

This guide explains how to train the spaced repetition interval prediction model using Google Colab.

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Training with Google Colab](#training-with-google-colab)
- [Model Architecture](#model-architecture)
- [Feature Engineering](#feature-engineering)
- [Deploying the Trained Model](#deploying-the-trained-model)
- [Retraining Guidelines](#retraining-guidelines)
- [Troubleshooting](#troubleshooting)

## Overview

The ML model predicts optimal review intervals for spaced repetition learning. It uses:
- **51 advanced features** (8 base + 43 engineered)
- **Neural network architecture**: 51 → 128 → 64 → 32 → 16 → 1
- **TensorFlow.js** for cross-platform compatibility
- **Real user review history** from MongoDB

## Prerequisites

### Required
- Google account (for Colab access)
- MongoDB Atlas database with user review history
- MongoDB connection string (URI)

### Recommended Data Volume
- **Minimum**: 50+ training samples (2+ reviews per question)
- **Good**: 100+ training samples
- **Optimal**: 500+ training samples from real users

### Note on Training Data
The model needs **real user review history** to train effectively. If you're just starting:
1. Use the existing pre-trained model (trained on simulated data)
2. Collect real user data for 2-4 weeks
3. Retrain with actual performance metrics

## Training with Google Colab

### Step 1: Open the Notebook

**Option A: From GitHub**
1. Go to [Google Colab](https://colab.research.google.com)
2. File → Open notebook → GitHub tab
3. Enter your repository URL
4. Select `colab-training-notebook.ipynb`

**Option B: Upload Local File**
1. Go to [Google Colab](https://colab.research.google.com)
2. File → Upload notebook
3. Select `colab-training-notebook.ipynb` from your local machine

### Step 2: Enable GPU Acceleration

1. In Colab: **Runtime → Change runtime type**
2. Hardware accelerator: **GPU** (Tesla T4)
3. Click **Save**

> **Why GPU?** Training is ~10-50x faster with GPU vs CPU. The free tier includes Tesla T4 access.

### Step 3: Configure MongoDB Connection

In **Cell 2** (Configuration), update the MongoDB URI:

```python
MONGODB_URI = "mongodb+srv://username:password@cluster.mongodb.net/spaced-repetition?retryWrites=true&w=majority"
```

**Finding your MongoDB URI:**
1. Log in to [MongoDB Atlas](https://cloud.mongodb.com)
2. Go to your cluster
3. Click **Connect** → **Connect your application**
4. Copy the connection string
5. Replace `<password>` with your actual password

### Step 4: Configure Training Parameters (Optional)

You can adjust hyperparameters in Cell 2:

```python
EPOCHS = 100           # Number of training iterations (default: 100)
BATCH_SIZE = 32        # Samples per training batch (default: 32)
VALIDATION_SPLIT = 0.2 # Validation data % (default: 20%)
LEARNING_RATE = 0.001  # Adam optimizer learning rate (default: 0.001)
```

**When to adjust:**
- **More data (500+ samples)**: Increase EPOCHS to 150-200
- **Small dataset (<100 samples)**: Decrease EPOCHS to 50-75
- **Overfitting**: Decrease EPOCHS or increase VALIDATION_SPLIT
- **Underfitting**: Increase EPOCHS or decrease LEARNING_RATE

### Step 5: Run the Notebook

**Option A: Run all cells**
- Runtime → Run all (Ctrl+F9)
- Wait 2-10 minutes depending on data size

**Option B: Run step-by-step**
- Click the play button (▶) on each cell
- Review outputs before proceeding

### Step 6: Monitor Training

Watch for these indicators:

**Good signs:**
- ✅ Validation loss decreases steadily
- ✅ Test MAE < Baseline MAE
- ✅ Improvement > 50%
- ✅ No huge gap between training/validation loss

**Warning signs:**
- ⚠️ Validation loss increases (overfitting)
- ⚠️ Test MAE > Baseline MAE (model worse than baseline)
- ⚠️ Large gap between train/val loss (overfitting)

### Step 7: Download the Trained Model

The last cell will trigger a download:

```
📦 spaced_repetition_model.zip
```

This contains:
- `model.json` - Model architecture
- `group1-shard*.bin` - Model weights
- `normalization-stats.json` - Feature scaling parameters
- `metadata.json` - Training metrics and config

## Model Architecture

### Neural Network Structure

```
Input Layer (51 features)
    ↓
Dense(128, ReLU) + BatchNorm + Dropout(0.3)
    ↓
Dense(64, ReLU) + BatchNorm + Dropout(0.25)
    ↓
Dense(32, ReLU) + Dropout(0.2)
    ↓
Dense(16, ReLU)
    ↓
Dense(1, Softplus)  ← Predicted interval (days)
```

**Total Parameters**: ~13,000

### Loss Function & Optimizer

- **Loss**: Mean Squared Error (MSE)
- **Optimizer**: Adam (lr=0.001)
- **Metric**: Mean Absolute Error (MAE) in days

## Feature Engineering

The model uses **51 features** organized into 7 categories:

### 1. Base Features (8)
- Memory strength (current interval)
- Difficulty rating (0-1)
- Time since last review
- Success rate (% correct)
- Average response time
- Total reviews
- Consecutive correct streak
- Time of day (normalized 0-1)

### 2. Forgetting Curve Features (5)
Based on Ebbinghaus exponential decay:
- Forgetting curve value
- Adjusted decay (performance-weighted)
- Log-transformed decay rate
- Log-transformed memory strength
- Raw decay rate

### 3. Interaction Features (10)
Non-linear relationships:
- Difficulty × Time
- Difficulty × Memory
- Success × Memory
- Response time × Difficulty
- Experience × Success
- Etc.

### 4. Polynomial Features (9)
Higher-order terms:
- Squared features (memory², difficulty², etc.)
- Cubic memory strength
- Square roots
- Inverse features

### 5. Cyclical Time Features (5)
- Sinusoidal encoding (sin/cos)
- Morning/Afternoon/Evening flags

### 6. Moving Average Features (5)
Trends over recent reviews:
- Recent success rate (last 5 reviews)
- Recent avg response time
- Performance trend (improving/declining)
- Difficulty trend
- Velocity trend (review frequency)

### 7. Momentum Features (4)
Learning acceleration:
- Learning momentum
- Streak strength
- Performance acceleration
- Mastery level

### 8. Retention Prediction Features (5)
Cognitive science-based:
- Stability (how well-learned)
- Retrievability (current recall ease)
- Learning efficiency
- Retention probability
- Optimal interval estimate

## Deploying the Trained Model

### For Local Development

1. **Extract the model**:
   ```bash
   cd spaced-repetition-capstone-server
   unzip spaced_repetition_model.zip
   mv tfjs_model/* ml/saved-model/
   ```

2. **Restart the server**:
   ```bash
   npm start
   # or
   node server.js
   ```

3. **Verify model loaded**:
   Check server logs for:
   ```
   ✓ Model loaded from ml/saved-model
   ```

### For Production (Render)

1. **Update via Git**:
   ```bash
   # Extract model files locally
   unzip spaced_repetition_model.zip

   # Replace files in git repo
   cp -r tfjs_model/* spaced-repetition-capstone-server/ml/saved-model/

   # Commit and push
   git add spaced-repetition-capstone-server/ml/saved-model/
   git commit -m "Update ML model with Colab training (MAE: X.XX days)"
   git push
   ```

2. **Trigger Render deployment**:
   - Auto-deploys if enabled
   - Or manually trigger in Render dashboard

3. **Verify deployment**:
   - Check Render logs for model loading
   - Test predictions via API endpoints

## Retraining Guidelines

### When to Retrain

Retrain the model when:
- ✅ **Weekly**: If you have 100+ new reviews
- ✅ **Monthly**: For production apps with steady usage
- ✅ **Major changes**: After algorithm updates or new features
- ✅ **Performance degradation**: If predictions become less accurate

### Best Practices

1. **Monitor model performance**:
   - Track MAE over time
   - Compare ML vs baseline algorithms
   - Watch for model drift

2. **Version your models**:
   ```bash
   # Save with timestamp
   mv ml/saved-model ml/saved-model-2025-01-15
   # Allows rollback if new model performs worse
   ```

3. **A/B test new models**:
   - Deploy to a subset of users first
   - Compare performance metrics
   - Full rollout if successful

4. **Document training runs**:
   - Save `metadata.json` from each training
   - Track: MAE, training time, data size, improvement %

### Hyperparameter Tuning Tips

**If model is overfitting** (validation loss > training loss):
- Decrease `EPOCHS` (e.g., 100 → 75)
- Increase dropout rates in architecture
- Add more training data

**If model is underfitting** (both losses high):
- Increase `EPOCHS` (e.g., 100 → 150)
- Increase model size (more neurons)
- Check for data quality issues

**For small datasets** (<100 samples):
- Use `EPOCHS = 50-75`
- Higher `VALIDATION_SPLIT = 0.25`
- Consider simpler architecture

**For large datasets** (500+ samples):
- Use `EPOCHS = 150-200`
- Can experiment with deeper networks
- Try batch size 64 or 128

## Troubleshooting

### "No training data found!"

**Cause**: MongoDB has no users with review history

**Solution**:
1. Verify MongoDB URI is correct
2. Check users have `reviewHistory` arrays with 2+ entries
3. Simulate reviews for testing:
   ```bash
   node scripts/simulate-reviews.js 100
   ```

### "Model worse than baseline"

**Cause**: Insufficient or poor-quality training data

**Solution**:
1. Collect more real user data (not simulated)
2. Verify review timestamps are realistic (not all same day)
3. Ensure variety in question difficulty

### "Out of memory" error in Colab

**Cause**: Dataset too large for free tier

**Solution**:
1. Reduce `BATCH_SIZE` to 16 or 8
2. Use Colab Pro ($10/month) for more RAM
3. Sample your dataset (use subset for training)

### Model not loading on server

**Cause**: Incompatible TensorFlow.js version or corrupt files

**Solution**:
1. Check `ml/saved-model/model.json` exists
2. Verify `normalization-stats.json` exists
3. Check TensorFlow.js version in `package.json`
4. Re-export from Colab if files corrupted

### Training takes too long

**Cause**: GPU not enabled or large dataset

**Solution**:
1. Verify GPU is enabled in Colab (Runtime → Change runtime type)
2. Reduce `EPOCHS` temporarily
3. Check session hasn't timed out (free tier: 12 hours max)

## Performance Expectations

### Baseline Comparison

The model should outperform the baseline (just using current interval):
- **Good**: 30-50% improvement
- **Great**: 50-80% improvement
- **Excellent**: 80%+ improvement

### Typical MAE Values

- **Baseline SM-2**: 1.5-2.5 days MAE
- **ML Model (good)**: 0.5-1.0 days MAE
- **ML Model (excellent)**: 0.1-0.5 days MAE

### Training Time

- **Small dataset** (50-100 samples): 1-2 minutes
- **Medium dataset** (100-500 samples): 2-5 minutes
- **Large dataset** (500+ samples): 5-15 minutes

All with GPU enabled. CPU training is 10-50x slower.

## Resources

### Documentation
- [TensorFlow.js Guide](https://www.tensorflow.org/js/guide)
- [Google Colab FAQ](https://research.google.com/colaboratory/faq.html)
- [MongoDB Atlas Docs](https://docs.atlas.mongodb.com/)

### Paper References
- Ebbinghaus Forgetting Curve
- SM-2 Algorithm (SuperMemo)
- Spaced Repetition Research

### Support

If you encounter issues:
1. Check the [Troubleshooting](#troubleshooting) section above
2. Review Colab notebook cell outputs for error messages
3. Verify MongoDB connection and data format
4. Open an issue on GitHub with error logs

---

**Last Updated**: 2025-01-06
**Model Version**: 1.0.0
**Architecture**: 51 → 128 → 64 → 32 → 16 → 1
