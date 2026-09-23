from dataclasses import dataclass, field
from datetime import datetime, timedelta


@dataclass
class Event:
    title: str
    start: datetime
    end: datetime
    all_day: bool = False
    location: str | None = None
    attendees: list[str] = field(default_factory=list)
    description: str | None = None

    @property
    def duration(self) -> timedelta:
        if self.all_day:
            return timedelta(0)
        return self.end - self.start
