#!/bin/bash

# Start server with GPU support for TensorFlow.js
# This script sets up the correct library paths before starting Node.js

# Set CUDA library path to include compatibility symlinks
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export LD_LIBRARY_PATH="$SCRIPT_DIR/cuda-compat:$LD_LIBRARY_PATH"

echo "Starting server with GPU support..."
echo "CUDA compat path: $SCRIPT_DIR/cuda-compat"
echo "LD_LIBRARY_PATH: $LD_LIBRARY_PATH"
echo ""

# Start the server
node index.js
