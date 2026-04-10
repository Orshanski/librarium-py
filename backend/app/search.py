"""Shared fuzzy search toolkit.

Custom rapidfuzz-backed scorer for UI search (books, authors, series).
Provider-matching / duplicate detection lives in its own workflow
(see bead librarium-py-7o2) and will reuse `search_preprocess` when
ready.
"""
from rapidfuzz import fuzz, utils
from rapidfuzz.distance import Indel


def search_preprocess(s: str | None) -> str:
    """Normalize a string for fuzzy matching.

    Runs rapidfuzz's default_process (lowercase, replace non-alphanum
    with spaces) plus:
    - Russian ё→е normalisation that default_process doesn't cover
    - Whitespace collapse (default_process leaves double spaces where
      punctuation used to be).

    Applied to both query and haystack values so they meet in the
    same canonical form.
    """
    if not s:
        return ""
    s = s.replace("ё", "е").replace("Ё", "Е")
    s = utils.default_process(s)
    return " ".join(s.split())


def _token_match_score(q_token: str, c_token: str) -> float:
    """Score how well q_token matches c_token, 0-100. The min of:

    - **LCS coverage from the query perspective**: what fraction of
      q_token appears in-order inside c_token. Catches prefix / typo
      cases: 'тайфун' → 'тайфуны' = 100%, 'достоевск' → 'достоевский'
      = 100%, 'короли' → 'кори' = 67%.

    - **Symmetric fuzz.ratio** (Levenshtein-based): forces overall
      edit distance to be small. Keeps LCS from being too permissive
      when two short words happen to share enough letters in order:
      'короли' vs 'космобиолухи' has LCS 83 but ratio 55, so the min
      (55) correctly rejects the match. 'крыса' vs 'корсакова' has
      LCS 80 but ratio ~57 → rejected.

    Combined with a 75 cutoff in token_min_ratio this covers:
      прошивка  → прошивки          ✓ pass
      достоевск → достоевский       ✓ pass
      короли    → королей           ✓ pass
      сандерсн  → сандерсон         ✓ pass
      короли    → космобиолухи      ✗ reject
      крыса     → корсакова         ✗ reject
      мария     → информация        ✗ reject
      мария     → марк              ✗ reject

    Known limitation — short prefix against a much longer word gets
    rejected by the ratio floor: e.g. 'толк' (4) vs 'толкиен' (7)
    has LCS-cov 100 but ratio ~73, so the min (73) is below the 75
    cutoff and the match is dropped. Users need to type ≥5 chars of
    a prefix for it to survive the ratio floor against 7+ char words.
    Keeping this as intentional: lowering the cutoff to 70 would let
    noise like 'мария → марк' back through. Revisit if it bites.
    """
    if not q_token or not c_token:
        return 0.0
    indel = Indel.distance(q_token, c_token)
    lcs_len = (len(q_token) + len(c_token) - indel) / 2
    lcs_coverage = (lcs_len / len(q_token)) * 100.0
    ratio = fuzz.ratio(q_token, c_token)
    return min(lcs_coverage, ratio)


def token_min_ratio(
    query: str,
    choice: str,
    *,
    processor=None,
    score_cutoff: float = 0.0,
    **_: object,
) -> float:
    """Custom rapidfuzz-compatible scorer: for each query token, find
    its best query-coverage match among the choice tokens, return the
    minimum across query tokens.

    Semantics: every word in the query must find an in-order
    supersequence inside some word of the choice. The weakest match
    drags the whole score down, so partial matches on multi-word
    queries don't leak in. Single-word short queries are handled by
    `_token_match_score`'s LCS + ratio metric: a short query must
    actually be (nearly) contained in the target, not just overlap
    with a short noise word.

    This replaces the earlier fuzz.WRatio-based approach, which was
    too loose on short queries against long concatenated haystacks
    — e.g. 'мария' scoring 67+ against random book titles and 'короли'
    scoring 80 against author 'Кори'.

    Signature follows the rapidfuzz custom-scorer contract:
    process.extract applies `processor` to both query and choice
    externally before this runs. `score_cutoff` is accepted for API
    compatibility but not used as an early-exit (the loops are cheap).
    """
    q_tokens = query.split()
    c_tokens = choice.split()
    if not q_tokens or not c_tokens:
        return 0.0
    per_token_best = [
        max((_token_match_score(qt, ct) for ct in c_tokens), default=0.0)
        for qt in q_tokens
    ]
    return min(per_token_best)


# score_cutoff for UI search on the 0-100 scale used by token_min_ratio.
# Empirically:
# - real matches on single-word queries (крыса, тайфун, сандерсн) land
#   at 80-100
# - noise on single-word queries where no real token match exists lands
#   at ~66 and below
# - prefix queries (достоевск → Достоевский) land at 85-90
# 75 sits comfortably in the gap. Tune via manual tests on live data.
SEARCH_SCORE_CUTOFF = 75.0

# Hardcoded cap for authors/series in search results. The router's
# `limit` parameter only applies to books. 10 is what the old LIKE-based
# implementation shipped with, kept for wire-compat with SearchPage.
AUTHORS_SERIES_LIMIT = 10
