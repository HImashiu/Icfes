# Booklets whose two sessions share one PDF (M, P)

1. `cropsplit.py LAYOUT PDF GOLDEN P0 P1 OUT` cuts per-session crops from the combined Azure layout (pages P0-P1).
2. Build format requests as usual (`format_stage build`), with `env.sh` pointing at the split crops/layout.
3. After the relay: `post1r.sh E S` = apply + `resolve_held.py` (free: accepts held fields whose changes are moves between
   stimulus/stem, math typesetting or dropped OCR junk, and picture options emptied from "[chart]" placeholders) + figures + merge + math requests.
4. `post2.sh E S` applies math; `fixups.py`, `dedup_stem.py` clean leftovers; `lostfig.py` and `mismatch.py` flag
   questions that lost a picture or whose content no longer matches the old golden (wrong anchor).
5. `install.sh E S` copies the merged session into the shared data with backups.
