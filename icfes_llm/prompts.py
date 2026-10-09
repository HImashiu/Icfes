"""Prompt + JSON schemas. Bump PROMPT_VERSION whenever either changes (it is part of the cache key)."""
PROMPT_VERSION = "v1"

SYSTEM = """You transcribe multiple-choice exam questions from scanned pages of the Colombian ICFES Saber 11 exam into structured data.

Rules:
- Transcribe exactly what is printed. Do NOT solve the question, explain it, translate it, or fix spelling/grammar.
- Keep the original language (Spanish or English). Keep numbering words such as "Paso 1." inside the option text.
- Write mathematics as LaTeX between single dollar signs, e.g. $\\frac{1}{3}$, $x^{2}+1$, $25 \\times \\frac{4}{5}$. Plain numbers and units stay plain text.
- Answer options are labelled A, B, C (D when the item has four). Return one entry per option, in order. Options may be printed as images, tables or diagrams: transcribe what you can read; if an option is a picture you cannot express in text, write a short description in square brackets, e.g. [diagram of two parallel forces].
- A solid BLUE circle drawn over an option letter is a digital marker left on the scan, not part of the exam. Do not transcribe it, read the option text next to it, and set marked_in_scan to true for that option. Blue handwriting or blue typed notes anywhere are also not part of the exam: ignore them completely.
- Ignore page furniture (running headers, "PRUEBA", page numbers, "Escaneado con CamScanner").
- The OCR text you are given may contain mistakes (wrong letters, merged options, flattened fractions). The image is the source of truth. Use the OCR only as a hint.
- stem_md is the question that is asked (the last paragraph before the options). Put nothing else in it.
- If something is unreadable, write [illegible] in its place and add a short note to issues. Never guess content you cannot see.
- confidence: high when every word was clearly legible, medium when a few characters were uncertain, low when parts were guessed or missing."""

_OPTION = {
    "type": "object",
    "properties": {
        "letter": {"type": "string", "enum": ["A", "B", "C", "D"]},
        "text_md": {"type": "string"},
        "marked_in_scan": {"type": "boolean"},
    },
    "required": ["letter", "text_md", "marked_in_scan"],
    "additionalProperties": False,
}

_ITEM_PROPS = {
    "stem_md": {"type": "string"},
    "options": {"type": "array", "items": _OPTION},
    "issues": {"type": "array", "items": {"type": "string"}},
    "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
}

QUESTION_SCHEMA = {"type": "object", "properties": dict(_ITEM_PROPS),
                   "required": list(_ITEM_PROPS), "additionalProperties": False}

GROUP_SCHEMA = {
    "type": "object",
    "properties": {"items": {"type": "array", "items": {
        "type": "object",
        "properties": {"number": {"type": "integer"}, **_ITEM_PROPS},
        "required": ["number", *_ITEM_PROPS], "additionalProperties": False}}},
    "required": ["items"], "additionalProperties": False,
}


def question_prompt(number: int, item_type: str | None, expected: int | None, ocr_stem: str, ocr_options: list[dict]) -> str:
    opts = "\n".join(f"  {o['letter']}. {o['text_md']}" for o in ocr_options) or "  (none detected)"
    return (f"The image is the scanned region of question {number}. Item type: {item_type or 'standard'}; "
            f"expected number of options: {expected or 'unknown'}.\n\n"
            f"OCR text (may be wrong):\nQuestion: {ocr_stem or '(none)'}\nOptions:\n{opts}\n\n"
            "Return the transcription of THIS question only.")


def group_prompt(numbers: list[int], directions: str) -> str:
    return (f"The image is the scanned region of a part of the exam with directions: \"{directions}\".\n"
            f"It contains the items numbered {numbers[0]} to {numbers[-1]} (some answers are shown only as pictures). "
            "Return one entry per numbered item you can find, using its printed number. For picture items the 'question' "
            "is the printed prompt or the text shown in the picture; the options are the printed choices.")
