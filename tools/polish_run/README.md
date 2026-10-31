# Booklet formatting run (gpt-5 via the laptop relay)

Glue scripts used to format the C–O booklets. `S`/`N` at the top of each script is the working folder
(crops in `crop/crops/`, preformatted goldens in `H/`, results in `R/`, fallback versions in `v2/`).

1. `build.sh` — preformat each session's golden and write `T-fmt-<e>_<s>.N.jsonl` requests to the relay queue.
2. Relay answers land in `queue/out`; stage them, then `dedupe.py` (one answer per request id).
3. `post1n.sh e s` — apply, bold labels, figures/place/tidy/paragraphs (`chain.sh`), fallback version for units
   gpt-5 got wrong (`mergesess.py`), then math requests `M-<e>_<s>.jsonl`.
4. `post2.sh e s` — apply math, word check, editor load zip (`zipsess.py`).
5. On the laptop: `python3 load.py <zip> S11-<e>_<s> <backup-suffix>` (backs up golden, manifest and specs first).
6. `review.py e s` — flagged units with scan and editor render for the review page.
