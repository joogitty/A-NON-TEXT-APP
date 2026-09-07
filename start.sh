#!/usr/bin/env bash
echo "========================================================"
echo "  👻 GhostChat - Air-Gapped Anonymous Messenger"
echo "========================================================"
echo "Launching local secure server on http://localhost:8000 ..."
if command -v python3 &>/dev/null; then
    python3 serve.py
elif command -v python &>/dev/null; then
    python serve.py
else
    echo "Python not found. Please open index.html in your browser."
fi
