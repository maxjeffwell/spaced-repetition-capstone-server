#!/usr/bin/env python3
import json
import numpy as np
import tf_keras as keras

# Load model
print("Loading model...")
model = keras.models.load_model('ml/interval_model_advanced.h5')

# Load normalization stats
with open('ml/saved-model/normalization-stats.json', 'r') as f:
    stats = json.load(f)
    mean = np.array(stats['mean'])
    std = np.array(stats['std'])

# Test case: Card with memoryStrength=1, successRate=0.75, totalReviews=24
# (the example from your browser console)
from scripts.train_model_advanced import create_advanced_features

test_sample = {
    'features': {
        'memoryStrength': 1,
        'difficultyRating': 0.25,  # 1 - 0.75 success rate
        'timeSinceLastReview': 0,
        'successRate': 0.75,
        'averageResponseTime': 3000,
        'totalReviews': 24,
        'consecutiveCorrect': 5,
        'timeOfDay': 0.5
    }
}

features = create_advanced_features(test_sample)
features = np.array(features, dtype=np.float32).reshape(1, -1)

# Normalize
features_norm = (features - mean) / std

# Predict
prediction = model.predict(features_norm, verbose=0)
print(f"\nTest prediction for well-performing card:")
print(f"  Raw prediction: {prediction[0][0]:.2f} days")
print(f"  Rounded: {max(1, round(prediction[0][0]))} days")
