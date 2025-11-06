#!/usr/bin/env python3
"""
Simulate ML predictions using the trained TensorFlow model

This Python script:
1. Loads the TensorFlow.js model (converted to Python format)
2. Connects to MongoDB
3. Generates ML predictions for existing reviews
4. Updates reviewHistory with algorithmUsed: 'ml'

Usage:
    python scripts/simulate-ml-predictions.py --users=3 --reviews=50
"""

import json
import numpy as np
import tensorflow as tf
from pymongo import MongoClient
from datetime import datetime, timedelta
import os
import sys
import argparse

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def load_model_and_stats(model_path='ml/saved-model'):
    """Load the TensorFlow model and normalization stats"""
    print("Loading ML model...")

    # Load the model using tensorflowjs converter
    # First, we need to convert the TF.js model to TF Python format
    model_json_path = os.path.join(model_path, 'model.json')

    # For now, let's load it using tf.keras if possible
    # TF.js models can be loaded with tensorflowjs_converter
    try:
        # This requires: pip install tensorflowjs
        import tensorflowjs as tfjs
        model = tfjs.converters.load_keras_model(model_json_path)
    except ImportError:
        print("⚠️  tensorflowjs not installed. Install with: pip install tensorflowjs")
        print("Attempting alternative loading method...")
        # Alternative: manually reconstruct from JSON
        model = load_model_from_json(model_path)

    # Load normalization stats
    stats_path = os.path.join(model_path, 'normalization-stats.json')
    with open(stats_path, 'r') as f:
        stats = json.load(f)

    mean = np.array(stats['mean'], dtype=np.float32)
    std = np.array(stats['std'], dtype=np.float32)

    print(f"✓ Model loaded: {model.count_params()} parameters")
    print(f"✓ Normalization stats loaded: {len(mean)} features")

    return model, mean, std


def load_model_from_json(model_path):
    """Manually load model architecture from model.json"""
    print("Reconstructing model from JSON...")

    # Create model with same architecture
    model = tf.keras.Sequential([
        tf.keras.layers.Input(shape=(51,)),
        tf.keras.layers.Dense(128, activation='relu', kernel_initializer='he_normal'),
        tf.keras.layers.BatchNormalization(),
        tf.keras.layers.Dropout(0.3),
        tf.keras.layers.Dense(64, activation='relu', kernel_initializer='he_normal'),
        tf.keras.layers.BatchNormalization(),
        tf.keras.layers.Dropout(0.25),
        tf.keras.layers.Dense(32, activation='relu', kernel_initializer='he_normal'),
        tf.keras.layers.Dropout(0.2),
        tf.keras.layers.Dense(16, activation='relu', kernel_initializer='he_normal'),
        tf.keras.layers.Dense(1, activation='softplus')
    ])

    # Load weights from .bin file
    weights_path = os.path.join(model_path, 'group1-shard1of1.bin')

    # Read model.json to get weight structure
    model_json_path = os.path.join(model_path, 'model.json')
    with open(model_json_path, 'r') as f:
        model_data = json.load(f)

    # This is complex - for now, return the model without weights
    # The weights will need to be loaded from the .bin file
    print("⚠️  Model created without weights - predictions will be random")
    print("   To use actual weights, install: pip install tensorflowjs")

    return model


def create_advanced_features(base_features, review_history=None):
    """
    Generate 51 advanced features from base features
    Must match the Node.js advanced-features.js logic exactly
    """
    import math

    # Base features (8)
    ms = base_features['memoryStrength']
    dr = base_features['difficultyRating']
    ts = base_features['timeSinceLastReview']
    sr = base_features['successRate']
    art = base_features['averageResponseTime'] / 1000  # Convert to seconds
    tr = base_features['totalReviews']
    cc = base_features['consecutiveCorrect']
    tod = base_features['timeOfDay']

    # Forgetting curve features (5)
    decay_rate = ts / max(ms, 0.1)
    forgetting_curve = math.exp(-decay_rate)
    learner_strength = max(0.1, sr * 2)
    adjusted_decay = math.exp(-decay_rate / learner_strength)
    log_time_decay = math.log1p(max(0, decay_rate))
    log_memory_strength = math.log1p(ms)

    # Interaction features (10)
    difficulty_time_product = dr * ts
    difficulty_memory_product = dr * ms
    success_memory_product = sr * ms
    success_time_product = sr * ts
    response_time_difficulty_product = art * dr
    response_time_memory_product = art * ms
    consecutive_memory_product = cc * ms
    consecutive_difficulty_ratio = cc / dr if dr > 0 else cc
    experience_success_product = tr * sr
    experience_difficulty_ratio = tr / (dr + 1) if dr > 0 else tr

    # Polynomial features (9)
    memory_strength_squared = ms * ms
    difficulty_squared = dr * dr
    time_squared = ts * ts
    success_rate_squared = sr * sr
    memory_strength_cubed = ms ** 3
    sqrt_memory_strength = math.sqrt(max(0, ms))
    sqrt_total_reviews = math.sqrt(max(0, tr))
    inverse_memory_strength = 1 / ms if ms > 0 else 0
    inverse_difficulty = 1 / dr if dr > 0.01 else 100

    # Cyclical time encoding (5)
    radians = tod * 2 * math.pi
    time_of_day_sin = math.sin(radians)
    time_of_day_cos = math.cos(radians)
    is_morning = 1 if 0.25 <= tod < 0.5 else 0
    is_afternoon = 1 if 0.5 <= tod < 0.75 else 0
    is_evening = 1 if tod >= 0.75 or tod < 0.25 else 0

    # Moving average features (5) - simplified without full history
    recent_success_rate = sr  # Approximation
    recent_avg_response_time = art
    performance_trend = 0
    difficulty_trend = 0
    velocity_trend = 0

    # Momentum features (4)
    learning_momentum = 0
    streak_strength = cc / math.sqrt(max(1, tr))
    performance_acceleration = 0
    mastery_level = sr * (1 - abs(recent_success_rate - sr))

    # Retention features (5)
    stability = math.log1p(cc) * math.log1p(ms)
    retrievability = forgetting_curve * (1 - dr)
    learning_efficiency = sr / math.log1p(max(0, tr))
    retention_probability = min(1, retrievability * (1 + stability * 0.1))
    optimal_interval_estimate = max(1, ms * abs(math.log(0.9)) * (1 + stability * 0.1))

    # Return as ordered array (51 features)
    features = [
        # Base (8)
        ms, dr, ts, sr, art, tr, cc, tod,
        # Forgetting curve (5)
        forgetting_curve, adjusted_decay, log_time_decay, log_memory_strength, decay_rate,
        # Interaction (10)
        difficulty_time_product, difficulty_memory_product, success_memory_product, success_time_product,
        response_time_difficulty_product, response_time_memory_product, consecutive_memory_product,
        consecutive_difficulty_ratio, experience_success_product, experience_difficulty_ratio,
        # Polynomial (9)
        memory_strength_squared, difficulty_squared, time_squared, success_rate_squared,
        memory_strength_cubed, sqrt_memory_strength, sqrt_total_reviews,
        inverse_memory_strength, inverse_difficulty,
        # Cyclical time (5)
        time_of_day_sin, time_of_day_cos, is_morning, is_afternoon, is_evening,
        # Moving average (5)
        recent_success_rate, recent_avg_response_time, performance_trend,
        difficulty_trend, velocity_trend,
        # Momentum (4)
        learning_momentum, streak_strength, performance_acceleration, mastery_level,
        # Retention (5)
        stability, retrievability, learning_efficiency, retention_probability,
        optimal_interval_estimate
    ]

    return np.array(features, dtype=np.float32)


def predict_interval(model, mean, std, base_features, review_history=None):
    """Make a prediction using the ML model"""
    # Generate 51 advanced features
    features = create_advanced_features(base_features, review_history)

    # Normalize
    features_normalized = (features - mean) / (std + 1e-8)

    # Reshape for model input
    features_batch = features_normalized.reshape(1, -1)

    # Predict
    prediction = model.predict(features_batch, verbose=0)[0][0]

    # Round to nearest day, minimum 1
    interval = max(1, round(float(prediction)))

    return interval


def simulate_ml_predictions(mongodb_uri, num_users=3, reviews_per_user=50):
    """
    Generate ML predictions for existing reviews
    Updates reviews to have algorithmUsed: 'ml'
    """
    print("\n" + "="*60)
    print("ML Prediction Simulation (Python)")
    print("="*60)
    print(f"\nConfiguration:")
    print(f"  Users: {num_users}")
    print(f"  Reviews per user: ~{reviews_per_user}")
    print()

    # Load model
    model, mean, std = load_model_and_stats()

    # Connect to MongoDB
    print("Connecting to MongoDB...")
    client = MongoClient(mongodb_uri)
    db = client.get_default_database()
    users_collection = db['users']
    print("✓ Connected to MongoDB\n")

    # Get users with simulated data
    users = list(users_collection.find({'username': {'$regex': '^sim_'}}))[:num_users]

    print(f"Found {len(users)} simulated users\n")

    total_ml_predictions = 0

    for user in users:
        username = user['username']
        print(f"📊 Generating ML predictions for {username}...")

        ml_count = 0

        for question in user['questions']:
            review_history = question.get('reviewHistory', [])

            # Only process reviews that used baseline
            baseline_reviews = [r for r in review_history if r.get('algorithmUsed') == 'baseline']

            # Limit how many we convert to ML
            reviews_to_convert = min(len(baseline_reviews), reviews_per_user // len(user['questions']))

            for i, review in enumerate(baseline_reviews[:reviews_to_convert]):
                # Calculate features at time of review
                reviews_before = review_history[:review_history.index(review)]

                correct_count = sum(1 for r in reviews_before if r.get('recalled', False))
                success_rate = correct_count / len(reviews_before) if reviews_before else 0

                base_features = {
                    'memoryStrength': review.get('intervalUsed', 1),
                    'difficultyRating': 1 - success_rate,
                    'timeSinceLastReview': 0,  # Simplified
                    'successRate': success_rate,
                    'averageResponseTime': review.get('responseTime', 2000),
                    'totalReviews': len(reviews_before),
                    'consecutiveCorrect': question.get('consecutiveCorrect', 0),
                    'timeOfDay': review['timestamp'].hour / 24 if hasattr(review['timestamp'], 'hour') else 0.5
                }

                # Generate ML prediction
                ml_interval = predict_interval(model, mean, std, base_features, reviews_before)

                # Update review to use ML
                review['algorithmUsed'] = 'ml'
                review['mlInterval'] = ml_interval
                review['baselineInterval'] = review['intervalUsed']
                review['intervalUsed'] = ml_interval

                ml_count += 1

        # Save updated user
        users_collection.replace_one({'_id': user['_id']}, user)

        print(f"  ✓ Generated {ml_count} ML predictions")
        total_ml_predictions += ml_count

    print(f"\n{'='*60}")
    print("Simulation Complete!")
    print("="*60)
    print(f"\nTotal ML predictions generated: {total_ml_predictions}")
    print(f"Check your stats page to see the comparison!")
    print()

    client.close()


def main():
    parser = argparse.ArgumentParser(description='Simulate ML predictions in Python')
    parser.add_argument('--users', type=int, default=3, help='Number of users')
    parser.add_argument('--reviews', type=int, default=50, help='Reviews per user to convert')

    args = parser.parse_args()

    # Get MongoDB URI from environment
    mongodb_uri = os.getenv('MONGODB_URI')

    if not mongodb_uri:
        print("❌ MONGODB_URI environment variable not set")
        print("   Set it with: export MONGODB_URI='mongodb+srv://...'")
        sys.exit(1)

    simulate_ml_predictions(mongodb_uri, args.users, args.reviews)


if __name__ == '__main__':
    main()
