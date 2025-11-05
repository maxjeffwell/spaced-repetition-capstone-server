# ML Model Training Guide

## Current Status

The app is deployed and working with the **baseline spaced repetition algorithm**, which is based on proven spaced repetition research and works well.

The ML model enhancement is **optional** and will improve over time as real user data accumulates.

## Why ML Training Didn't Work Yet

The current training data was generated from simulated reviews that happened too quickly (within seconds/minutes instead of days/weeks). ML models need realistic interval spacing to learn optimal review schedules.

**Training produced NaN values** because intervals averaged 0.00 days.

## Future Training Strategy

### Step 1: Accumulate Real User Data (Weeks/Months)

Wait for actual users to study over time. Real data will show:
- How users perform after 1 day, 3 days, 7 days, etc.
- Which intervals work best for different difficulty levels
- Patterns in response times and success rates

### Step 2: Extract Training Data

Once you have sufficient real user data:

```bash
cd spaced-repetition-capstone-server
node scripts/extract-training-data.js training-data.json
```

This connects to your production MongoDB and extracts features from review history.

### Step 3: Train the Model

```bash
node scripts/train-model.js training-data.json 200
```

Watch for:
- ✅ Training loss decreasing (not NaN)
- ✅ Test MAE < Baseline MAE
- ✅ Improvement percentage > 0%

### Step 4: Export for Browser

```bash
node scripts/export-model-for-browser.js
```

This converts the TensorFlow.js model for use in the React client.

### Step 5: Deploy Updated Model

```bash
# Commit the trained model files
git add ml/saved-model/ ml/browser-model/
git commit -m "Update ML model with real user data"
git push

# Server will auto-deploy on Render
# Client will auto-deploy on Render
```

## How to Check if ML is Working

### Server Logs
Look for:
- ✅ "ML model loaded successfully"
- ❌ "ML model not found. Using baseline algorithm only"

### API Response
Check the `algorithmUsed` field in question answers:
- `"baseline"` = Using proven spaced repetition formula
- `"ml"` = Using trained ML model

### User Settings
Users can toggle between algorithms in settings:
- `useMLAlgorithm: false` = Baseline only
- `useMLAlgorithm: true` = ML predictions (when model available)

## Training Timeline Estimate

| Time | Data Available | Action |
|------|----------------|--------|
| Week 1-2 | Baseline reviews only | Monitor user engagement |
| Week 3-4 | ~50-100 review pairs | Early training attempt possible |
| Month 2-3 | 200+ review pairs | First realistic ML model |
| Month 6+ | 1000+ review pairs | Robust ML predictions |

## Monitoring Model Performance

After deploying a trained model, monitor these metrics:

1. **User Retention** - Are users coming back more often?
2. **Review Success Rate** - Are predictions helping users remember better?
3. **Model Confidence** - Check prediction variance
4. **A/B Testing** - Compare ML vs baseline performance

## Files

- `scripts/simulate-reviews-production.js` - Generate review data on production
- `scripts/extract-training-data.js` - Extract features from DB
- `scripts/train-model.js` - Train the ML model
- `scripts/export-model-for-browser.js` - Convert for client use
- `ml/saved-model/` - Server-side model files
- `ml/browser-model/` - Client-side model files (if exported)

## Questions?

The baseline algorithm is working great. ML is an enhancement for later!

---

**Next check: 2-3 weeks after launch** ✅
