from dataclasses import dataclass, field
from datetime import date


@dataclass
class Summary:
    period: str
    start: date
    end: date
    overview: str
    key_events: list[str] = field(default_factory=list)
    time_breakdown: str = ""
    highlights: list[str] = field(default_factory=list)
    empty: bool = False
