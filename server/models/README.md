# Bundled AI Model for Deep Learning Filter

This directory contains the bundled mDeBERTa model for multilingual zero-shot classification.

## Model: Xenova/mDeBERTa-v3-base-mnli-xnli

A multilingual model supporting 100+ languages for zero-shot text classification.

## Smart Loading Behavior

The `deep-learning-filter.js` uses smart model loading:
1. **Bundled Model**: If model files exist in this directory, they are used directly (no network required)
2. **Fallback Download**: If bundled model is not found, the model is downloaded from Hugging Face on first use

This allows:
- Development setups to auto-download on first run
- Distribution packages to include the pre-bundled model

## Expected Directory Structure

```
models/
└── Xenova/
    └── mDeBERTa-v3-base-mnli-xnli/
        ├── config.json
        ├── tokenizer.json
        ├── tokenizer_config.json
        ├── special_tokens_map.json
        └── onnx/
            └── model_quantized.onnx   (~280MB)
```

## How to Bundle the Model for Distribution

### Option 1: Let Transformers.js Download First

1. Run the server with Deep Learning mode enabled
2. Wait for the model to download (shown in console logs)
3. Copy from cache to this directory:
   ```powershell
   # Windows cache location
   Copy-Item "$env:USERPROFILE\.cache\huggingface\hub\models--Xenova--mDeBERTa-v3-base-mnli-xnli\snapshots\*" -Destination "Xenova\mDeBERTa-v3-base-mnli-xnli" -Recurse
   ```

### Option 2: Clone from Hugging Face Hub (requires account)

```bash
git lfs install
huggingface-cli login
git clone https://huggingface.co/Xenova/mDeBERTa-v3-base-mnli-xnli Xenova/mDeBERTa-v3-base-mnli-xnli
```

## Size Information

| Model | Size (Quantized) |
|-------|------------------|
| toxic-bert (old) | ~80 MB |
| mDeBERTa-v3-base-mnli-xnli (new) | ~280 MB |

The bundled model adds ~280MB to the distribution zip file. This is acceptable for offline classroom use.
