import argparse
import sys
from datetime import date, datetime

from calsum.sample_data import sample_events
from calsum.summarizer import (
    MissingAPIKeyError,
    QuotaExceededError,
    SummarizerError,
    summarize,
)
from calsum.summary import Summary
from calsum.windowing import filter_events, window_for

PERIODS = ("daily", "weekly", "monthly")


def render_summary(summary: Summary) -> str:
    lines = [
        f"{summary.period.capitalize()} summary "
        f"({summary.start.isoformat()} to {summary.end.isoformat()})",
        "=" * 48,
        "",
        summary.overview,
        "",
        "Key events:",
    ]
    lines += [f"  - {item}" for item in summary.key_events] or ["  (none)"]
    lines += ["", f"Time: {summary.time_breakdown}", "", "Highlights:"]
    lines += [f"  - {item}" for item in summary.highlights] or ["  (none)"]
    return "\n".join(lines)


def _parse_args(argv):
    parser = argparse.ArgumentParser(prog="calsum", description="AI calendar summarizer")
    parser.add_argument("--period", required=True, choices=PERIODS)
    parser.add_argument("--date", default=None, help="Reference date YYYY-MM-DD (default: today)")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None, summarize_fn=summarize) -> int:
    try:
        args = _parse_args(argv)
    except SystemExit as e:
        return e.code if e.code in (0, None) else 4

    if args.date is None:
        reference = date.today()
    else:
        try:
            reference = datetime.strptime(args.date, "%Y-%m-%d").date()
        except ValueError:
            print(f"Invalid --date {args.date!r}; expected YYYY-MM-DD.", file=sys.stderr)
            return 4

    start, end = window_for(args.period, reference)
    events = filter_events(sample_events(reference), start, end)

    try:
        summary = summarize_fn(events, args.period, start, end)
    except MissingAPIKeyError as exc:
        print(str(exc), file=sys.stderr)
        return 2
    except QuotaExceededError as exc:
        print(str(exc), file=sys.stderr)
        return 3
    except SummarizerError as exc:
        print(str(exc), file=sys.stderr)
        return 1

    print(render_summary(summary))
    return 0


if __name__ == "__main__":
    sys.exit(main())
