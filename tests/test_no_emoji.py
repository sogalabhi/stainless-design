"""The project rule: no emoji anywhere. Status is shown with icons and words."""

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EMOJI = re.compile("[\U0001f300-\U0001faff\u2600-\u27bf\u2b50\ufe0f\u2139\u25b6]")


def test_no_emoji_in_source_tests_or_docs() -> None:
    offenders = []
    patterns = (
        "src/**/*.py",
        "src/**/*.json",
        "tests/*.py",
        "*.md",
        "*.toml",
        "apps/web/src/**/*.ts",
        "apps/web/src/**/*.tsx",
        "apps/web/src/**/*.css",
    )
    for pattern in patterns:
        for path in ROOT.glob(pattern):
            if path.name == "plan.md":  # the user's own notes
                continue
            for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
                if EMOJI.search(line):
                    offenders.append(f"{path.relative_to(ROOT)}:{number}")
    assert not offenders, offenders
