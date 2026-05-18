"""
Enrich products.csv with AI-generated fields using Groq (Llama 4 Scout).

Reads the source CSV (id, name, brand, category, store_id, price, discount,
stock, image_count, image_first) and produces an enriched CSV with these
additional product-description columns:

    short_description, long_description, highlights, color,
    available_colors, available_sizes, material, target_gender,
    target_age_group, tags

Structured fields (color object; highlights/tags string arrays; available_colors
and available_sizes arrays of variant objects with mock stock flags) are
stored as JSON-encoded strings so the CSV stays flat.

The model is called in multimodal mode: it receives the `image_first` URL as
an actual image, so color and size inference uses BOTH the image and the text
description.

Usage:
    # from repo root
    source script/venv/bin/activate
    export GROQ_API_KEY=...           # or put it in script/.env
    python script/enrich_products.py --limit 20        # try a small batch first
    python script/enrich_products.py                   # full run

Output: products.enriched.csv (next to the input).
"""

from __future__ import annotations

import argparse
import base64
import csv
import json
import os
import re
import sys
import time
from pathlib import Path

import httpx
from dotenv import load_dotenv
from groq import Groq

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_INPUT = REPO_ROOT / "products.csv"
DEFAULT_OUTPUT = REPO_ROOT / "products.enriched.csv"

MODEL = "meta-llama/llama-4-scout-17b-16e-instruct"
IMAGE_FETCH_TIMEOUT = 20.0
IMAGE_USER_AGENT = "Mozilla/5.0 (compatible; AmaZaraEnricher/1.0)"

GENERATED_FIELDS = [
    "short_description",
    "long_description",
    "highlights",
    "color",
    "available_colors",
    "available_sizes",
    "material",
    "target_gender",
    "target_age_group",
    "tags",
]

SYSTEM_PROMPT = """You enrich e-commerce product data. You are given basic product info AND ONE product image. Output ONE JSON object with display-ready fields.

Rules:
- Output ONLY valid JSON, no markdown fences, no commentary.
- All strings in English.
- Use the IMAGE together with the text to infer color and size variants.
- Hex codes: 7-char "#rrggbb", lowercase.
- Stock semantics (mock data):
    * The variant that best matches the description and the image → stock = 1.
    * Other variants explicitly named in the description that do NOT match the image → stock = 0.
    * Plausible alternates you add for catalog variety (not mentioned anywhere) → stock = 1.
- Sizes: pick the size taxonomy that fits the category — clothing ["XS","S","M","L","XL","XXL"], shoes numeric, hats ["One Size"], etc. Use [] only when truly inapplicable.
- Keep copy concise and on-brand; do not invent specific technologies the brand doesn't use.

Required schema:
{
  "short_description": string,                                           // 1 sentence, <= 160 chars
  "long_description":  string,                                           // 2-3 short paragraphs of marketing copy
  "highlights":        string[],                                         // 3-5 bullet-point features
  "color":             {"name": string, "hex": string},                  // primary color shown in the image
  "available_colors":  [{"name": string, "hex": string, "stock": 0|1}],  // 2-5 colorways
  "available_sizes":   [{"label": string, "stock": 0|1}],                // size variants for the category
  "material":          string,                                           // primary material (e.g., "cotton blend")
  "target_gender":     "men"|"women"|"unisex"|"boys"|"girls"|"kids",
  "target_age_group":  "adult"|"big-kids"|"little-kids"|"infant",
  "tags":              string[]                                          // 3-7 search keywords, lowercase
}"""


def fetch_image_data_uri(url: str) -> str | None:
    """Download an image and return it as a base64 data URI.

    Groq's image fetcher does not follow HTTP redirects, and some CDNs (Nike's
    Cloudinary, etc.) return 301/302 to switch format or domain. By fetching
    client-side we sidestep that — and we also avoid CDN UA blocks.
    """
    try:
        resp = httpx.get(
            url,
            follow_redirects=True,
            timeout=IMAGE_FETCH_TIMEOUT,
            headers={"User-Agent": IMAGE_USER_AGENT},
        )
        resp.raise_for_status()
    except httpx.HTTPError as e:
        print(f"  ! image fetch failed ({e}); falling back to text-only", file=sys.stderr)
        return None
    mime = resp.headers.get("content-type", "image/jpeg").split(";", 1)[0].strip()
    b64 = base64.b64encode(resp.content).decode("ascii")
    return f"data:{mime};base64,{b64}"


def build_user_content(row: dict) -> list:
    """Multimodal user content: text block + the product image."""
    text = (
        "Generate the JSON object for this product. Use the attached image to "
        "confirm the primary color and to inform plausible variants.\n"
        f"- name: {row['name']}\n"
        f"- brand: {row['brand']}\n"
        f"- category: {row['category']}\n"
        f"- price_usd: {row['price']}"
    )
    content = [{"type": "text", "text": text}]
    image_url = row.get("image_first", "").strip()
    if image_url:
        data_uri = fetch_image_data_uri(image_url)
        if data_uri:
            content.append({"type": "image_url", "image_url": {"url": data_uri}})
    return content


def extract_json(text: str) -> dict:
    """Tolerant JSON parser: strips ``` fences and trailing prose if present."""
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?", "", text).strip()
        text = re.sub(r"```$", "", text).strip()
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1:
        raise ValueError(f"No JSON object found in model output: {text[:200]}")
    return json.loads(text[start : end + 1])


def call_groq(client: Groq, row: dict) -> dict:
    completion = client.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": build_user_content(row)},
        ],
        temperature=1,
        max_completion_tokens=2048,
        top_p=1,
        stream=True,
        stop=None,
    )

    buf = []
    for chunk in completion:
        delta = chunk.choices[0].delta.content
        if delta:
            buf.append(delta)
            print(delta, end="", flush=True)
    print()
    return extract_json("".join(buf))


def normalize(data: dict) -> dict:
    """Coerce model output into the exact schema we write to CSV.

    Structured values (dict / list) are JSON-encoded so the CSV stays flat;
    scalars are trimmed strings.
    """
    out = {}
    for key in GENERATED_FIELDS:
        value = data.get(key, "")
        if isinstance(value, (list, dict)):
            out[key] = json.dumps(value, ensure_ascii=False)
        elif value is None:
            out[key] = ""
        else:
            out[key] = str(value).strip()
    return out


def load_done_ids(output_path: Path) -> set[str]:
    """IDs already enriched successfully in a previous run.

    A row counts as done only if `short_description` is non-empty — failed
    rows (all generated fields blank) will be retried on the next run.
    """
    if not output_path.exists():
        return set()
    done: set[str] = set()
    with output_path.open(newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            if row.get("id") and row.get("short_description"):
                done.add(row["id"])
    return done


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Process at most N rows (0 = all). Useful for testing.",
    )
    parser.add_argument(
        "--sleep",
        type=float,
        default=0.0,
        help="Seconds to sleep between API calls (rate-limit cushion).",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Re-process every row, overwriting the output CSV (no resume).",
    )
    args = parser.parse_args()

    load_dotenv(REPO_ROOT / "script" / ".env")
    if not os.environ.get("GROQ_API_KEY"):
        print("ERROR: GROQ_API_KEY is not set (env or script/.env).", file=sys.stderr)
        return 2

    client = Groq()

    with args.input.open(newline="", encoding="utf-8") as fin:
        reader = csv.DictReader(fin)
        source_fields = reader.fieldnames or []
        rows = list(reader)

    if args.limit > 0:
        rows = rows[: args.limit]

    out_fields = source_fields + GENERATED_FIELDS
    args.output.parent.mkdir(parents=True, exist_ok=True)

    done_ids = set() if args.force else load_done_ids(args.output)
    append_mode = bool(done_ids) and not args.force
    pending = [r for r in rows if r["id"] not in done_ids]
    skipped = len(rows) - len(pending)
    if skipped:
        print(f"Resuming: {skipped} row(s) already enriched, {len(pending)} to do.")

    with args.output.open("a" if append_mode else "w", newline="", encoding="utf-8") as fout:
        writer = csv.DictWriter(fout, fieldnames=out_fields)
        if not append_mode:
            writer.writeheader()

        for idx, row in enumerate(pending, start=1):
            print(f"\n[{idx}/{len(pending)}] {row['name']}")
            try:
                data = call_groq(client, row)
                enriched = normalize(data)
            except Exception as e:  # noqa: BLE001 - keep batch going
                print(f"  ! failed: {e}", file=sys.stderr)
                enriched = {key: "" for key in GENERATED_FIELDS}
            writer.writerow({**row, **enriched})
            fout.flush()
            if args.sleep:
                time.sleep(args.sleep)

    print(f"\nDone. Wrote {len(pending)} new row(s) to {args.output} (skipped {skipped}).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
