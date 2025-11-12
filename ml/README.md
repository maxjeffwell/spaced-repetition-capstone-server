# ML Models Directory

This directory contains the machine learning models and related files for the spaced repetition system. The model files are **not tracked in git** as they are regeneratable and can be large.

## Missing Files After Clone?

If you've just cloned this repository, you'll need to generate the ML model files. These files are ignored by git:

- `*.h5` - Keras model files
- `saved-model*/` - TensorFlow.js model directories
- Other model formats (`.pb`, `.keras`, `.tflite`, `.onnx`)

## How to Generate Model Files

### Prerequisites

1. Ensure you have the Python training environment set up:
   ```bash
   python -m venv venv-training
   source venv-training/bin/activate  # On Windows: venv-training\Scripts\activate
   pip install tensorflow keras scikit-learn numpy pandas
   ```

2. Ensure you have training data available (see root `README.md` or `TRAINING_DATA_COLLECTION.md` for details)

### Training the Model

1. **Generate training data** (if not already available):
   ```bash
   # Option 1: Use realistic simulation
   node scripts/simulate-realistic-reviews.js

   # Option 2: Extract from existing user data
   node scripts/extract-training-data.js
   ```

2. **Train the model**:
   ```bash
   # Activate Python environment
   source venv-training/bin/activate

   # Train with advanced features (51 features)
   python scripts/train-model-advanced.py
   ```

3. **Convert to TensorFlow.js format** (for browser deployment):
   ```bash
   # Convert H5 model to TFJS format
   tensorflowjs_converter \
     --input_format=keras \
     ml/interval_model_advanced.h5 \
     ml/saved-model
   ```

### Expected Output Files

After training, you should have:

- `interval_model_advanced.h5` - Main Keras model (51 features)
- `interval_model_local.h5` - Alternative/backup model
- `saved-model/` - TensorFlow.js format for browser
  - `model.json` - Model architecture
  - `group1-shard1of1.bin` - Model weights
  - `metadata.json` - Model metadata
  - `normalization-stats.json` - Feature normalization parameters

## Model Architecture

The current model uses:
- **51 engineered features** including:
  - Ebbinghaus forgetting curve modeling
  - Interaction features (non-linear relationships)
  - Polynomial features (squared, cubed terms)
  - Cyclical time encoding
  - Moving averages and momentum

- **10-layer neural network**: 128 → 64 → 32 → 16 → 8 → 4 → 2 → 1
- Batch normalization and dropout for regularization
- ~96% accuracy improvement over baseline SM-2 algorithm

## Documentation

For more details, see:
- `../ADVANCED_FEATURES_SUMMARY.md` - Feature engineering details
- `../ML_TRAINING_GUIDE.md` - Comprehensive training guide
- `../CONTINUOUS_TRAINING.md` - Automated training pipeline
- `../ARCHITECTURE.md` - System architecture overview

## Quick Start (Development)

If you just want to get the server running without ML:

The server will work without model files, but ML predictions will be disabled and it will fall back to the baseline SM-2 algorithm only. To enable ML features, follow the training steps above.
