from datetime import date, datetime, time, timedelta

from calsum.events import Event


def _at(day: date, hour: int, minute: int = 0) -> datetime:
    return datetime.combine(day, time(hour, minute))


def sample_events(reference: date) -> list[Event]:
    """A believable month of calendar events anchored on the reference month."""
    month_start = reference.replace(day=1)
    # First Monday on or after the month start.
    first_monday = month_start + timedelta(days=(0 - month_start.weekday()) % 7)

    events: list[Event] = []

    # Four weeks of recurring + one-off events.
    for week in range(4):
        monday = first_monday + timedelta(weeks=week)
        tuesday = monday + timedelta(days=1)
        wednesday = monday + timedelta(days=2)
        thursday = monday + timedelta(days=3)
        friday = monday + timedelta(days=4)

        # Daily standup Mon-Fri.
        for offset in range(5):
            day = monday + timedelta(days=offset)
            events.append(
                Event(
                    title="Team standup",
                    start=_at(day, 9, 0),
                    end=_at(day, 9, 15),
                    attendees=["Team"],
                )
            )

        events.append(
            Event(
                title="1:1 with manager",
                start=_at(monday, 11, 0),
                end=_at(monday, 11, 30),
                attendees=["Priya"],
            )
        )
        events.append(
            Event(
                title="Focus block: feature work",
                start=_at(tuesday, 10, 0),
                end=_at(tuesday, 12, 30),
            )
        )
        events.append(
            Event(
                title="Design review",
                start=_at(wednesday, 14, 0),
                end=_at(wednesday, 15, 0),
                attendees=["Design", "Eng"],
                location="Room 4B",
            )
        )
        events.append(
            Event(
                title="Sprint planning",
                start=_at(thursday, 13, 0),
                end=_at(thursday, 14, 30),
                attendees=["Team"],
            )
        )
        events.append(
            Event(
                title="Gym",
                start=_at(friday, 18, 0),
                end=_at(friday, 19, 0),
            )
        )

    # A few one-off personal / notable events during the reference week.
    week_monday = reference - timedelta(days=reference.weekday())
    events.append(
        Event(
            title="Dentist appointment",
            start=_at(week_monday + timedelta(days=2), 8, 0),
            end=_at(week_monday + timedelta(days=2), 8, 45),
            location="Downtown Dental",
        )
    )
    events.append(
        Event(
            title="Product launch review",
            start=_at(week_monday + timedelta(days=3), 15, 30),
            end=_at(week_monday + timedelta(days=3), 17, 0),
            attendees=["Leadership", "Marketing", "Eng"],
            description="Go/no-go for the Q4 launch.",
        )
    )

    # Keep only events inside the reference month.
    month_end = _next_month_start(month_start)
    return [e for e in events if month_start <= e.start.date() < month_end]


def _next_month_start(month_start: date) -> date:
    if month_start.month == 12:
        return date(month_start.year + 1, 1, 1)
    return date(month_start.year, month_start.month + 1, 1)
