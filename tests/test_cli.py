from datetime import date, datetime
from calsum.summary import Summary
from calsum.summarizer import MissingAPIKeyError, QuotaExceededError
from calsum import cli


def _fake_summarize_ok(events, period, start, end):
    return Summary(
        period=period, start=start, end=end,
        overview="A busy Tuesday.",
        key_events=["09:00 Standup"],
        time_breakdown="~2h meetings",
        highlights=["Launch review needs prep"],
    )


def test_render_summary_includes_sections():
    s = _fake_summarize_ok([], "daily", date(2026, 9, 22), date(2026, 9, 23))
    text = cli.render_summary(s)
    assert "A busy Tuesday." in text
    assert "09:00 Standup" in text
    assert "Launch review needs prep" in text


def test_main_success_prints_summary(capsys):
    code = cli.main(["--period", "daily", "--date", "2026-09-22"], summarize_fn=_fake_summarize_ok)
    out = capsys.readouterr().out
    assert code == 0
    assert "A busy Tuesday." in out


def test_main_rejects_bad_period(capsys):
    code = cli.main(["--period", "yearly"], summarize_fn=_fake_summarize_ok)
    assert code == 4


def test_main_rejects_bad_date():
    code = cli.main(["--period", "daily", "--date", "not-a-date"], summarize_fn=_fake_summarize_ok)
    assert code == 4


def test_main_missing_key_returns_2(capsys):
    def boom(*a, **k):
        raise MissingAPIKeyError("no key")
    code = cli.main(["--period", "daily"], summarize_fn=boom)
    err = capsys.readouterr().err
    assert code == 2
    assert "no key" in err


def test_main_quota_returns_3():
    def boom(*a, **k):
        raise QuotaExceededError("slow down")
    code = cli.main(["--period", "daily"], summarize_fn=boom)
    assert code == 3


def test_main_help_returns_0(capsys):
    code = cli.main(["--help"], summarize_fn=_fake_summarize_ok)
    assert code == 0
