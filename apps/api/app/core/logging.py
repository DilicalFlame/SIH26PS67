"""Structured (JSON) logging setup (issue #34).

Call configure_logging() once, from create_app(). Everything else gets a
logger with structlog.get_logger(__name__) and free access to whatever the
request middleware bound onto structlog's contextvars (request_id, currently).
"""

from __future__ import annotations

import logging

import structlog


def configure_logging(log_level: str = "INFO") -> None:
    level = logging.getLevelNamesMapping().get(log_level.upper(), logging.INFO)

    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(level),
        logger_factory=structlog.PrintLoggerFactory(),
        # False so a later configure_logging() call (a new LOG_LEVEL) takes
        # effect immediately rather than being locked in by the first log
        # call a module-level logger ever made.
        cache_logger_on_first_use=False,
    )
