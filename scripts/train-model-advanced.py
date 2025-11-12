#!/usr/bin/env python3
"""
Train ML model with 51 advanced features using tf_keras (Keras 2.x)
Includes forgetting curves, interactions, polynomial features, etc.
Uses GPU acceleration if available
"""

import os
os.environ['TF_USE_LEGACY_KERAS'] = '1'

import json
import numpy as np
import tf_keras as keras
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

def create_advanced_features(sample):
    """Create 51 advanced features from a training sample"""
    features = sample['features']

    # 8 base features
    mem_strength = max(features['memoryStrength'], 0)  # Ensure non-negative
    difficulty = max(min(features['difficultyRating'], 1), 0)  # Clamp 0-1
    time_since = max(features['timeSinceLastReview'], 0.1)  # Ensure positive
    success_rate = max(min(features['successRate'], 1), 0)  # Clamp 0-1
    avg_response = max(features['averageResponseTime'] / 1000, 0.1)  # Convert to seconds, ensure positive
    total_reviews = max(features['totalReviews'], 0)
    consecutive = max(features['consecutiveCorrect'], 0)
    time_of_day = features['timeOfDay']

    # 5 forgetting curve features
    decay_rate = time_since / max(mem_strength, 0.1)
    forgetting_curve = np.exp(-min(decay_rate, 50))  # Cap to prevent overflow
    learner_strength = success_rate * 2
    adjusted_decay = np.exp(-min(decay_rate / max(learner_strength, 0.1), 50))
    log_time_decay = np.log1p(max(decay_rate, 0))
    log_memory_strength = np.log1p(max(mem_strength, 0))

    # 10 interaction features
    diff_time_product = difficulty * time_since
    diff_memory_product = difficulty * mem_strength
    success_memory_product = success_rate * mem_strength
    success_time_product = success_rate * time_since
    response_diff_product = avg_response * difficulty
    response_memory_product = avg_response * mem_strength
    consecutive_memory_product = consecutive * mem_strength
    consecutive_diff_ratio = consecutive / difficulty if difficulty > 0 else consecutive
    experience_success_product = total_reviews * success_rate
    experience_diff_ratio = total_reviews / (difficulty + 1) if difficulty > 0 else total_reviews

    # 9 polynomial features
    memory_squared = mem_strength ** 2
    difficulty_squared = difficulty ** 2
    time_squared = time_since ** 2
    success_squared = success_rate ** 2
    memory_cubed = mem_strength ** 3
    time_cubed = time_since ** 3
    sqrt_memory = np.sqrt(max(mem_strength, 0))
    sqrt_time = np.sqrt(max(time_since, 0))
    sqrt_reviews = np.sqrt(max(total_reviews, 0))

    # 5 cyclical time encoding
    time_radians = time_of_day * 2 * np.pi
    time_sin = np.sin(time_radians)
    time_cos = np.cos(time_radians)
    time_sin2 = np.sin(2 * time_radians)
    time_cos2 = np.cos(2 * time_radians)
    time_phase = np.arctan2(time_sin, time_cos)

    # 5 moving average features (simplified - no history in clean data)
    ma_difficulty = difficulty  # Would average if we had history
    ma_response_time = avg_response
    ma_success_rate = success_rate
    ma_interval = time_since
    review_frequency = total_reviews / max(time_since, 1)

    # 4 momentum features
    learning_velocity = consecutive / max(total_reviews, 1)
    difficulty_trend = 0  # Would calculate from history
    performance_acceleration = success_rate - 0.5  # Baseline at 0.5
    mastery_momentum = learning_velocity * mem_strength

    # 5 retention prediction features
    predicted_retention = forgetting_curve * success_rate
    confidence_score = success_rate * (1 - difficulty)
    stability_index = mem_strength / max(time_since, 0.1)
    learning_efficiency = success_rate / max(avg_response, 0.1)
    optimal_interval_estimate = mem_strength * (1 + success_rate)

    # Return all 51 features in order
    return [
        # Base (8)
        mem_strength, difficulty, time_since, success_rate,
        avg_response, total_reviews, consecutive, time_of_day,

        # Forgetting curve (5)
        forgetting_curve, adjusted_decay, log_time_decay,
        log_memory_strength, decay_rate,

        # Interactions (10)
        diff_time_product, diff_memory_product, success_memory_product,
        success_time_product, response_diff_product, response_memory_product,
        consecutive_memory_product, consecutive_diff_ratio,
        experience_success_product, experience_diff_ratio,

        # Polynomial (9)
        memory_squared, difficulty_squared, time_squared, success_squared,
        memory_cubed, time_cubed, sqrt_memory, sqrt_time, sqrt_reviews,

        # Cyclical time (5)
        time_sin, time_cos, time_sin2, time_cos2, time_phase,

        # Moving averages (5)
        ma_difficulty, ma_response_time, ma_success_rate,
        ma_interval, review_frequency,

        # Momentum (4)
        learning_velocity, difficulty_trend, performance_acceleration,
        mastery_momentum,

        # Retention (5)
        predicted_retention, confidence_score, stability_index,
        learning_efficiency, optimal_interval_estimate
    ]

# Extract features and labels
print("Creating advanced feature vectors...")
X = []
y = []

for sample in training_data:
    feature_vector = create_advanced_features(sample)
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

# Build model (for 51 features)
print("Building model...")
model = keras.Sequential([
    keras.layers.Dense(128, activation='relu', input_shape=(51,), kernel_initializer='he_normal'),
    keras.layers.BatchNormalization(),
    keras.layers.Dropout(0.3),

    keras.layers.Dense(64, activation='relu', kernel_initializer='he_normal'),
    keras.layers.BatchNormalization(),
    keras.layers.Dropout(0.25),

    keras.layers.Dense(32, activation='relu', kernel_initializer='he_normal'),
    keras.layers.Dropout(0.2),

    keras.layers.Dense(16, activation='relu', kernel_initializer='he_normal'),

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

# Save model in .h5 format
print("Saving model...")
model.save('ml/interval_model_advanced.h5')
print("✓ Saved: ml/interval_model_advanced.h5\n")

# Convert to TensorFlow.js format
print("Converting to TensorFlow.js format...")
os.system('tensorflowjs_converter '
          '--input_format=keras '
          '--output_format=tfjs_layers_model '
          'ml/interval_model_advanced.h5 '
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
    'modelVersion': '4.0.0-advanced',
    'trainedDate': datetime.now().isoformat(),
    'numFeatures': 51,
    'architecture': '51→128→64→32→16→1',
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
    'features': '51 advanced features with forgetting curves, interactions, polynomial, cyclical time, moving averages, momentum, and retention prediction',
    'exportMethod': 'tensorflowjs_converter_cli_advanced',
    'kerasVersion': keras.__version__,
    'trainedOnGPU': len(tf.config.list_physical_devices('GPU')) > 0
}

with open('ml/saved-model/metadata.json', 'w') as f:
    json.dump(metadata, f, indent=2)

print("✓ Saved: ml/saved-model/normalization-stats.json")
print("✓ Saved: ml/saved-model/metadata.json\n")

print("="*70)
print("✓ TRAINING COMPLETE WITH 51 ADVANCED FEATURES!")
print("="*70)
print("\nModel files saved to ml/saved-model/")
print("\nNext steps:")
print("1. Run: node scripts/convert-keras3-to-keras2.js")
print("2. Test: node scripts/debug-ml-predictions.js")
print("3. Copy to client: public/models/")
print("4. Deploy!")
print("="*70)
