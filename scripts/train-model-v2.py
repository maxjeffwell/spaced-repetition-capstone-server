#!/usr/bin/env python
"""
Train the v2 interval model from ml/training-matrix-v2.json (built by
scripts/build-training-matrix.js with the PRODUCTION feature code) and export
every artefact the app needs:

  ml/interval_model_v2.h5                 Keras (tf_keras, legacy format)
  ml/saved-model/{model.json,*.bin}       TF.js layers model (server + browser)
  ml/saved-model/normalization-stats.json {mean, std} for the 24 features
  ml/saved-model/metadata.json            version / metrics / feature names
  ml/ovms-savedmodel/2/                   TensorFlow SavedModel for OVMS
                                           (input "dense_input", output "output_0")

Run from the server repo root with the training venv:
  venv-training/bin/python scripts/train-model-v2.py
"""
import json
import os
import shutil
import subprocess
import sys
from datetime import datetime, timezone

os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")
os.environ.setdefault("TF_USE_LEGACY_KERAS", "1")

import numpy as np  # noqa: E402
import tensorflow as tf  # noqa: E402
import tf_keras as keras  # noqa: E402  (legacy Keras 2 API; same export path as v1)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MATRIX = os.path.join(ROOT, "ml", "training-matrix-v2.json")
TFJS_DIR = os.path.join(ROOT, "ml", "saved-model")
OVMS_DIR = os.path.join(ROOT, "ml", "ovms-savedmodel", "2")
H5_PATH = os.path.join(ROOT, "ml", "interval_model_v2.h5")
SEED = 7

np.random.seed(SEED)
tf.random.set_seed(SEED)


def load_matrix():
    with open(MATRIX) as f:
        d = json.load(f)
    X = np.asarray(d["X"], dtype=np.float32)
    y = np.asarray(d["y"], dtype=np.float32).reshape(-1, 1)
    return X, y, d["featureNames"], d["meta"]


def build_model(n_features):
    model = keras.Sequential([
        keras.layers.InputLayer(input_shape=(n_features,), name="dense_input"),
        keras.layers.Dense(128, activation="relu", kernel_initializer="he_normal"),
        keras.layers.BatchNormalization(),
        keras.layers.Dropout(0.1),
        keras.layers.Dense(64, activation="relu", kernel_initializer="he_normal"),
        keras.layers.Dense(32, activation="relu", kernel_initializer="he_normal"),
        keras.layers.Dense(16, activation="relu", kernel_initializer="he_normal"),
        keras.layers.Dense(1, activation="softplus", name="output_0"),
    ])
    model.compile(optimizer=keras.optimizers.Adam(1e-3), loss=keras.losses.Huber(delta=5.0), metrics=["mae"])
    return model


def sanity_sweeps(model, mean, std, names):
    """Growth checks on the trained model. Each row: (description, base features)."""
    sys.path.insert(0, ROOT)
    idx = {n: i for i, n in enumerate(names)}

    def vec(memory, success, consec, diff, total, recalled, rt=3000, tod=0.5):
        # Mirror ml/advanced-features.js createAdvancedFeatureVector/getFeatureArray
        m = max(memory, 0.0)
        rts = rt / 1000.0
        f = {
            "memoryStrength": memory, "difficultyRating": diff, "successRate": success,
            "averageResponseTime": rts, "totalReviews": total, "consecutiveCorrect": consec,
            "timeOfDay": tod, "recalled": recalled,
            "logMemoryStrength": np.log1p(m), "sqrtMemoryStrength": np.sqrt(m), "memoryStrengthSquared": m * m,
            "difficultyMemoryProduct": diff * memory, "successMemoryProduct": success * memory,
            "consecutiveMemoryProduct": consec * memory, "recalledMemoryProduct": recalled * memory,
            "recalledConsecutive": recalled * consec, "experienceSuccessProduct": total * success,
            "experienceDifficultyRatio": total / (diff + 1) if diff > 0 else total,
            "responseTimeDifficultyProduct": rts * diff,
            "timeSin": np.sin(tod * 2 * np.pi), "timeCos": np.cos(tod * 2 * np.pi),
            "learningVelocity": consec / max(total, 1), "performanceAcceleration": success - 0.5,
            "confidenceScore": success * (1 - diff),
        }
        return np.asarray([f[n] for n in names], dtype=np.float32)

    cases = [
        ("new card, recalled (m=1)", vec(1.0, 1.0, 1, 0.2, 1, 1)),
        ("m=3, 80% success, 5 streak, recalled", vec(3.0, 0.8, 5, 0.3, 17, 1)),
        ("m=6, same, recalled", vec(6.0, 0.8, 6, 0.3, 18, 1)),
        ("m=12, same, recalled", vec(12.0, 0.8, 7, 0.3, 19, 1)),
        ("m=25, same, recalled", vec(25.0, 0.8, 8, 0.3, 20, 1)),
        ("m=50, same, recalled", vec(50.0, 0.8, 9, 0.3, 21, 1)),
        ("m=12, 80% success, FORGOTTEN", vec(12.0, 0.8, 0, 0.3, 19, 0)),
        ("m=12, 40% success, hard card, recalled", vec(12.0, 0.4, 1, 0.8, 19, 1)),
    ]
    out = []
    for desc, x in cases:
        p = float(model.predict(((x - mean) / std)[None, :], verbose=0)[0][0])
        out.append((desc, round(p, 2)))
    return out, idx


def main():
    X, y, names, meta = load_matrix()
    n = X.shape[1]
    print(f"matrix: {X.shape[0]} rows x {n} features; label median {np.median(y):.1f} max {y.max():.0f}")

    perm = np.random.permutation(len(X))
    X, y = X[perm], y[perm]
    split = int(len(X) * 0.85)
    X_train, X_test, y_train, y_test = X[:split], X[split:], y[:split], y[split:]

    mean = X_train.mean(axis=0)
    std = X_train.std(axis=0) + 1e-8
    Xn_train, Xn_test = (X_train - mean) / std, (X_test - mean) / std

    model = build_model(n)
    model.summary(print_fn=lambda s: print("  " + s))
    cb = [
        keras.callbacks.EarlyStopping(monitor="val_mae", patience=12, restore_best_weights=True),
        keras.callbacks.ReduceLROnPlateau(monitor="val_mae", factor=0.5, patience=5, min_lr=1e-5),
    ]
    model.fit(Xn_train, y_train, validation_split=0.15, epochs=150, batch_size=64, verbose=0, callbacks=cb)

    pred = model.predict(Xn_test, verbose=0)
    mae = float(np.mean(np.abs(pred - y_test)))
    # naive baseline: predict the card's current memory strength (no growth)
    base_mae = float(np.mean(np.abs(X_test[:, names.index("memoryStrength")].reshape(-1, 1) - y_test)))
    recalled_mask = X_test[:, names.index("recalled")] > 0.5
    mae_recalled = float(np.mean(np.abs(pred[recalled_mask] - y_test[recalled_mask])))
    mae_forgot = float(np.mean(np.abs(pred[~recalled_mask] - y_test[~recalled_mask])))
    print(f"test MAE {mae:.3f} days (recalled {mae_recalled:.3f}, forgotten {mae_forgot:.3f}); no-growth baseline MAE {base_mae:.3f}")

    sweeps, _ = sanity_sweeps(model, mean, std, names)
    print("growth sweep:")
    for desc, p in sweeps:
        print(f"  {desc:45s} -> {p:6.2f} days")
    grown = [p for d, p in sweeps if "same, recalled" in d or "new card" in d]
    assert all(b > a for a, b in zip(grown, grown[1:])), "predicted interval must grow with memory strength"
    assert dict(sweeps)["m=12, 80% success, FORGOTTEN"] < 2.5, "forgotten card must reset to ~1 day"
    assert dict(sweeps)["m=12, 80% success, FORGOTTEN"] < dict(sweeps)["m=12, same, recalled"] / 4

    # --- exports -------------------------------------------------------------
    model.save(H5_PATH)
    if os.path.isdir(TFJS_DIR):
        for fn in os.listdir(TFJS_DIR):
            if fn.endswith((".json", ".bin")):
                os.remove(os.path.join(TFJS_DIR, fn))
    os.makedirs(TFJS_DIR, exist_ok=True)
    converter = os.path.join(os.path.dirname(sys.executable), "tensorflowjs_converter")
    subprocess.run([converter, "--input_format=keras", "--output_format=tfjs_layers_model", H5_PATH, TFJS_DIR], check=True)

    if os.path.isdir(OVMS_DIR):
        shutil.rmtree(OVMS_DIR)
    model.save(OVMS_DIR, save_format="tf")  # SavedModel; serving_default input=dense_input output=output_0

    with open(os.path.join(TFJS_DIR, "normalization-stats.json"), "w") as f:
        json.dump({"mean": mean.tolist(), "std": std.tolist()}, f)
    metadata = {
        "modelVersion": "5.0.0-v2-growth",
        "featureVersion": meta.get("featureVersion", 2),
        "numFeatures": n,
        "featureNames": names,
        "trainedDate": datetime.now(timezone.utc).isoformat(),
        "architecture": f"{n}->128->BN->64->32->16->1(softplus)",
        "trainingSize": int(split), "testSize": int(len(X) - split),
        "label": meta.get("label"),
        "performance": {"testMAE": mae, "testMAERecalled": mae_recalled, "testMAEForgotten": mae_forgot,
                        "baselineMAE": base_mae, "improvement": (1 - mae / base_mae) * 100 if base_mae else 0},
        "growthSweep": [{"case": d, "days": p} for d, p in sweeps],
        "exportMethod": "tf_keras h5 -> tensorflowjs_converter(keras) + SavedModel(tf)",
    }
    with open(os.path.join(TFJS_DIR, "metadata.json"), "w") as f:
        json.dump(metadata, f, indent=2)
    print(f"exported: {H5_PATH}, {TFJS_DIR}/model.json, {OVMS_DIR}/saved_model.pb")


if __name__ == "__main__":
    main()
