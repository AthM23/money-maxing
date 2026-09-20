#!/bin/bash
# Run the smoke SFT inside the NGC container on the GX10. ~5 min after image + model are cached.
set -e
docker run --rm --gpus all --ipc=host \
  -v "$HOME/.cache/huggingface:/root/.cache/huggingface" \
  -v "$HOME/ft:/ws" \
  nvcr.io/nvidia/pytorch:25.09-py3 \
  bash -lc "pip install -q 'transformers>=4.56' trl peft datasets accelerate && python /ws/smoke_sft.py"
