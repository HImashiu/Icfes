"""Stage 3: Claude vision transcription of the questions the deterministic stages could not resolve.

Reads the source crops written by icfes_crop plus the OCR text, asks Claude for a structured transcription,
cross-checks it against the OCR and against a second pass, and writes questions/<doc>.ai.json.
Everything is cached and capped by a hard spending limit.
"""
