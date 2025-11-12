#!/usr/bin/env python3
"""
Train ML model locally using tf_keras (Keras 2.x) for TensorFlow.js compatibility
Uses GPU acceleration if available
"""

import os
# Force TensorFlow to use Keras 2.x (tf_keras) instead of Keras 3
os.environ['TF_USE_LEGACY_KERAS'] = '1'

import json
import numpy as np
import tf_keras as keras  # Use tf_keras directly for Keras 2.x
from datetime import datetime

# Check GPU
import tensorflow as tf
print("TensorFlow version:", tf.__version__)
print("Keras version:", keras.__version__)
print("GPU available:", len(tf.config.list_physical_devices('GPU')) > 0)
print()

# Load clean training data
print("Loading training data...")
with open('training-data-clean.json', 'r') as f:
    training_data = json.load(f)

print(f"Loaded {len(training_data)} samples\n")

# Extract features and labels
X = []
y = []

for sample in training_data:
    # Flatten all features into array
    features = sample['features']
    feature_vector = [
        features['memoryStrength'],
        features['difficultyRating'],
        features['timeSinceLastReview'],
        features['successRate'],
        features['averageResponseTime'] / 1000,  # Convert to seconds
        features['totalReviews'],
        features['consecutiveCorrect'],
        features['timeOfDay']
    ]

    X.append(feature_vector)
    y.append(sample['label']['optimalInterval'])

X = np.array(X, dtype=np.float32)
y = np.array(y, dtype=np.float32).reshape(-1, 1)

print(f"Feature matrix: {X.shape}")
print(f"Label vector: {y.shape}")
print(f"Label range: [{y.min():.1f}, {y.max():.1f}] days\n")

# Split data
from sklearn.model_selection import train_test_split
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42
)

# Normalize features
mean = X_train.mean(axis=0)
std = X_train.std(axis=0) + 1e-8

X_train_norm = (X_train - mean) / std
X_test_norm = (X_test - mean) / std

print(f"Training set: {X_train.shape[0]} samples")
print(f"Test set: {X_test.shape[0]} samples\n")

# Build model (simpler architecture for 8 features)
print("Building model...")
model = keras.Sequential([
    keras.layers.Dense(64, activation='relu', input_shape=(8,), kernel_initializer='he_normal'),
    keras.layers.BatchNormalization(),
    keras.layers.Dropout(0.3),

    keras.layers.Dense(32, activation='relu', kernel_initializer='he_normal'),
    keras.layers.BatchNormalization(),
    keras.layers.Dropout(0.25),

    keras.layers.Dense(16, activation='relu', kernel_initializer='he_normal'),
    keras.layers.Dropout(0.2),

    keras.layers.Dense(1, activation='softplus')
])

model.compile(
    optimizer=keras.optimizers.Adam(learning_rate=0.001),
    loss='mse',
    metrics=['mae']
)

model.summary()
print()

# Train
print("Training model...\n")
history = model.fit(
    X_train_norm,
    y_train,
    epochs=100,
    batch_size=32,
    validation_split=0.2,
    callbacks=[
        keras.callbacks.EarlyStopping(
            monitor='val_loss',
            patience=15,
            restore_best_weights=True
        ),
        keras.callbacks.ReduceLROnPlateau(
            monitor='val_loss',
            factor=0.5,
            patience=7,
            min_lr=0.00001
        )
    ],
    verbose=1
)

print("\n✓ Training complete!\n")

# Evaluate
test_loss, test_mae = model.evaluate(X_test_norm, y_test, verbose=0)
baseline_mae = np.mean(np.abs(X_test[:, 0] - y_test))  # memoryStrength baseline
improvement = ((baseline_mae - test_mae) / baseline_mae) * 100

print(f"Test MAE: {test_mae:.2f} days")
print(f"Baseline MAE: {baseline_mae:.2f} days")
print(f"Improvement: {improvement:.1f}%\n")

# Save model in .h5 format (Keras 2.x compatible)
print("Saving model...")
model.save('ml/interval_model_local.h5')
print("✓ Saved: ml/interval_model_local.h5\n")

# Convert to TensorFlow.js format
print("Converting to TensorFlow.js format...")
os.system('tensorflowjs_converter '
          '--input_format=keras '
          '--output_format=tfjs_layers_model '
          'ml/interval_model_local.h5 '
          'ml/saved-model')

# Save normalization stats
print("Saving normalization stats...")
stats = {
    'mean': mean.tolist(),
    'std': std.tolist()
}

with open('ml/saved-model/normalization-stats.json', 'w') as f:
    json.dump(stats, f, indent=2)

# Save metadata
metadata = {
    'modelVersion': '3.0.0-local',
    'trainedDate': datetime.now().isoformat(),
    'numFeatures': 8,
    'architecture': '8→64→32→16→1',
    'trainingSize': len(X_train),
    'testSize': len(X_test),
    'performance': {
        'testMAE': float(test_mae),
        'testLoss': float(test_loss),
        'baselineMAE': float(baseline_mae),
        'improvement': float(improvement)
    },
    'training': {
        'epochs': 100,
        'batchSize': 32,
        'learningRate': 0.001,
        'validationSplit': 0.2
    },
    'exportMethod': 'tensorflowjs_converter_cli_local',
    'kerasVersion': keras.__version__,
    'trainedOnGPU': len(tf.config.list_physical_devices('GPU')) > 0
}

with open('ml/saved-model/metadata.json', 'w') as f:
    json.dump(metadata, f, indent=2)

print("✓ Saved: ml/saved-model/normalization-stats.json")
print("✓ Saved: ml/saved-model/metadata.json\n")

print("="*70)
print("✓ TRAINING COMPLETE!")
print("="*70)
print("\nModel files saved to ml/saved-model/")
print("\nNext steps:")
print("1. Test: node scripts/debug-ml-predictions.js")
print("2. If working, copy to client: public/models/")
print("3. Re-enable ML in ml/ml-service.js")
print("="*70)
