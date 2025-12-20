#!/usr/bin/env python3
"""
Convert Keras (.h5) model to OpenVINO Intermediate Representation (IR)
"""

import os
import sys

try:
    import openvino as ov
    from openvino.tools.mo import convert_model
    import tensorflow as tf
except ImportError:
    print("Error: Missing dependencies.")
    print("Please install them using: pip install openvino-dev tensorflow")
    sys.exit(1)

def convert():
    input_path = 'ml/interval_model_local.h5'
    output_dir = 'ml/openvino-model/1' # '1' for versioning in OVMS
    
    if not os.path.exists(input_path):
        print(f"Error: {input_path} not found.")
        return

    if not os.path.exists(output_dir):
        os.makedirs(output_dir, exist_ok=True)

    print(f"Loading Keras model from {input_path}...")
    # Load without compiling to avoid issues with custom/mismatched metrics
    model = tf.keras.models.load_model(input_path, compile=False)
    
    print("Converting to OpenVINO IR...")
    # Provide example input for tracing (batch_size=1, features=8)
    example_input = tf.zeros((1, 8))
    ov_model = ov.convert_model(model, example_input=example_input)
    
    # Save the model
    xml_path = os.path.join(output_dir, "model.xml")
    ov.save_model(ov_model, xml_path)
    
    print(f"\n✓ Conversion successful!")
    print(f"✓ Model XML: {xml_path}")
    print(f"✓ Model BIN: {xml_path.replace('.xml', '.bin')}")
    print(f"\nNext steps for your NAS:")
    print(f"1. Upload the 'ml/openvino-model' folder to your NAS.")
    print(f"2. Run the OpenVINO Model Server Docker container targeting the GPU.")

if __name__ == "__main__":
    convert()
