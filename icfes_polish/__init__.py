"""Formatting, figure and key pipeline on top of the existing OCR goldens (icfes-golden/1).

Stages: preformat (scripted rules) -> model edits from the scan crop -> validators -> render-and-compare check.
Keys: blue dot + independent solves + judge, then explanation and hint written for the settled key and re-checked.
No exam content lives in this package; it reads goldens, scans and Azure results from paths given on the command line.
"""
