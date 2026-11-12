/// Unix seconds as RFC 3339 in UTC, the form cozy-stack reads in `CreatedAt`.
pub(crate) fn rfc3339(seconds: i64) -> String {
    let days = seconds.div_euclid(86_400);
    let time = seconds.rem_euclid(86_400);
    let (year, month, day) = civil_from_days(days);
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}Z",
        time / 3600,
        time % 3600 / 60,
        time % 60
    )
}

/// The instant of an RFC 3339 date, as cozy-stack writes them
/// (`2026-11-11T10:00:00.5+01:00`), to the second. `None` if unreadable.
pub(crate) fn seconds_of(date: &str) -> Option<i64> {
    let number = |range: std::ops::Range<usize>| date.get(range)?.parse::<i64>().ok();
    let days = days_from_civil(number(0..4)?, number(5..7)?, number(8..10)?);
    let time = number(11..13)? * 3600 + number(14..16)? * 60 + number(17..19)?;
    let zone = date[19..].trim_start_matches(|c: char| c == '.' || c.is_ascii_digit());
    let offset = match zone.as_bytes().first()? {
        b'Z' | b'z' => 0,
        sign @ (b'+' | b'-') => {
            let minutes =
                zone.get(1..3)?.parse::<i64>().ok()? * 60 + zone.get(4..6)?.parse::<i64>().ok()?;
            if *sign == b'+' {
                minutes * 60
            } else {
                -minutes * 60
            }
        }
        _ => return None,
    };
    Some(days * 86_400 + time - offset)
}

/// Howard Hinnant's `days_from_civil`: a date to days since 1970-01-01.
fn days_from_civil(year: i64, month: i64, day: i64) -> i64 {
    let year = if month <= 2 { year - 1 } else { year };
    let era = year.div_euclid(400);
    let yoe = year.rem_euclid(400);
    let doy = (153 * (if month > 2 { month - 3 } else { month + 9 }) + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

/// Howard Hinnant's `civil_from_days`: days since 1970-01-01 to a date.
fn civil_from_days(days: i64) -> (i64, i64, i64) {
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);
    (year, month, day)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn known_dates() {
        assert_eq!(rfc3339(0), "1970-01-01T00:00:00Z");
        assert_eq!(rfc3339(951_782_400), "2000-02-29T00:00:00Z");
        assert_eq!(rfc3339(1_794_355_200 + 3661), "2026-11-11T01:01:01Z");
        assert_eq!(rfc3339(-1), "1969-12-31T23:59:59Z");
    }

    #[test]
    fn stack_dates_are_read_with_their_zone() {
        assert_eq!(seconds_of("2026-11-11T00:00:00Z"), Some(1_794_355_200));
        assert_eq!(
            seconds_of("2026-11-11T01:00:00.123+01:00"),
            Some(1_794_355_200)
        );
        assert_eq!(
            seconds_of("2000-02-29T00:00:00-00:30"),
            Some(951_782_400 + 1800)
        );
        assert_eq!(seconds_of("not a date"), None);
        for seconds in [0, 951_782_400, 1_794_355_200 + 3661] {
            assert_eq!(seconds_of(&rfc3339(seconds)), Some(seconds));
        }
    }
}
