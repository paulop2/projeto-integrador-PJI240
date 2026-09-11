#!/usr/bin/env python3
"""Inventário resumido do BLUEXv2 (2ª fase discursiva) para a frente COMVEST/Unicamp.

O BLUEXv2 está fora do contrato de múltipla escolha do produto; este script existe
para registrar proveniência, contagens e a sobreposição estrutural com o BLUEX de
1ª fase, sem transportar o conteúdo das questões para o aplicativo.

Uso:
    python scripts/inventory-bluexv2-unicamp.py \
        --parquet <caminho/train-00000-of-00001.parquet> \
        --expected-sha256 9F976D... \
        --commit 9284b8c... \
        --bluex-inventory docs/research/data/comvest-unicamp-bluex-inventory.json \
        --out docs/research/data/comvest-unicamp-bluexv2-summary.json --pretty
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from collections import Counter, defaultdict

try:
    import pyarrow.parquet as pq
except ImportError:  # pragma: no cover - explicit guidance for a local tool
    sys.stderr.write("pyarrow é necessário: pip install pyarrow\n")
    raise


def sha256_file(path: str) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--parquet", required=True)
    parser.add_argument("--expected-sha256")
    parser.add_argument("--commit")
    parser.add_argument("--bluex-inventory")
    parser.add_argument("--out")
    parser.add_argument("--pretty", action="store_true")
    return parser.parse_args()


def load_bluex_years(path: str | None) -> list[int]:
    if not path:
        return []
    with open(path, encoding="utf-8") as handle:
        inventory = json.load(handle)
    years = {record["year"] for record in inventory.get("records", [])}
    return sorted(years)


def main() -> int:
    args = parse_args()
    actual_sha256 = sha256_file(args.parquet)
    if args.expected_sha256 and actual_sha256.lower() != args.expected_sha256.lower():
        sys.stderr.write(
            f"SHA-256 do Parquet não confere: {actual_sha256} != {args.expected_sha256}\n"
        )
        return 1

    table = pq.read_table(args.parquet)
    rows = [row for row in table.to_pylist() if str(row["university"]).lower() == "unicamp"]

    parents_by_year: dict[int, set[str]] = defaultdict(set)
    subquestions_by_year: Counter[int] = Counter()
    subjects: Counter[str] = Counter()
    labels: Counter[str] = Counter()
    image_parents: set[str] = set()
    subquestions_with_images = 0
    image_assets = 0
    distinct_image_paths: set[str] = set()
    with_expected_answer = 0
    with_marking_criteria = 0

    for row in rows:
        year = int(row["year"])
        question_id = str(row["question_id"])
        parents_by_year[year].add(question_id)
        subquestions_by_year[year] += 1
        for subject in str(row["subject"]).split(","):
            if subject.strip():
                subjects[subject.strip()] += 1
        labels[str(row["subquestion_label"])] += 1
        if row["images"]:
            subquestions_with_images += 1
            image_parents.add(question_id)
            for image in row["images"]:
                image_assets += 1
                distinct_image_paths.add(str(image["path"]))
        if str(row["expected_answer"]).strip():
            with_expected_answer += 1
        if row["marking_criteria"]:
            with_marking_criteria += 1

    bluex_years = load_bluex_years(args.bluex_inventory)
    bluexv2_years = sorted(parents_by_year)
    overlap_years = sorted(set(bluex_years) & set(bluexv2_years))

    payload = {
        "generatedBy": "scripts/inventory-bluexv2-unicamp.py",
        "provenance": {
            "dataset": "BLUEXv2",
            "commit": args.commit,
            "parquet": {
                "fileName": os.path.basename(args.parquet),
                "byteSize": os.path.getsize(args.parquet),
                "sha256": actual_sha256,
                "expected": args.expected_sha256,
                "verified": args.expected_sha256 is None
                or actual_sha256.lower() == args.expected_sha256.lower(),
            },
        },
        "university": "unicamp",
        "phase": "second",
        "questionKind": "open-ended",
        "totalRows": table.num_rows,
        "subquestions": len(rows),
        "parentQuestions": len({row["question_id"] for row in rows}),
        "byYear": [
            {
                "year": year,
                "parents": len(parents_by_year[year]),
                "subquestions": subquestions_by_year[year],
            }
            for year in bluexv2_years
        ],
        "subquestionLabels": dict(sorted(labels.items())),
        "subjects": dict(sorted(subjects.items())),
        "subquestionsWithImages": subquestions_with_images,
        "parentQuestionsWithImages": len(image_parents),
        "imageAssets": image_assets,
        "distinctImagePaths": len(distinct_image_paths),
        "subquestionsWithExpectedAnswer": with_expected_answer,
        "subquestionsWithMarkingCriteria": with_marking_criteria,
        "overlap": {
            "bluexYears": bluex_years,
            "bluexv2Years": bluexv2_years,
            "sharedYears": overlap_years,
            "sharedRawQuestionIds": 0,
            "note": (
                "BLUEX e BLUEXv2 cobrem fases distintas: múltipla escolha de 1ª fase "
                "versus discursiva de 2ª fase. Não há questão importável em comum; a "
                "sobreposição é apenas de anos/institution."
            ),
        },
    }

    body = json.dumps(payload, ensure_ascii=False, indent=2 if args.pretty else None) + "\n"
    if args.out:
        os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
        with open(args.out, "w", encoding="utf-8") as handle:
            handle.write(body)
        sys.stdout.write(
            f"Inventariadas {len(rows)} subquestões de 2ª fase (fora do escopo) em {args.out}.\n"
        )
    else:
        sys.stdout.write(body)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
