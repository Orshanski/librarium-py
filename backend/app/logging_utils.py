"""Utilities for safe logging.

Mitigates log injection (CWE-117, Sonar S5145) — untrusted input with
embedded CR/LF forges extra log entries once the log is consumed by a
line-based parser (journald, ELK, Splunk). See safe() below.
"""
_LF_ESCAPE = {0x0A: "\\n", 0x0D: "\\r"}


def safe(value: object, maxlen: int = 200) -> str:
    """Sanitize arbitrary value for safe inclusion in a log message.

    Replaces literal CR/LF with escaped forms so attacker-controlled input
    (filenames, URLs, exception messages) cannot inject fake log lines.
    Truncates to `maxlen` characters to prevent log flooding.

    Use at every log.* call site where part of the format args originates
    from user-controlled data (request bodies, query params, uploaded file
    names, upstream API responses).
    """
    return str(value).translate(_LF_ESCAPE)[:maxlen]
