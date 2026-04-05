import dayjs from 'dayjs';

/** Canonical transaction date — effectiveDate if set, otherwise date. */
export function txnDate(txn) {
  return txn.effectiveDate || txn.date;
}

/** Dayjs instance for the canonical transaction date. */
export function txnDayjs(txn) {
  return dayjs(txn.effectiveDate || txn.date);
}

/** Transaction's month key as YYYY-MM string. */
export function txnMonth(txn) {
  return (txn.effectiveDate || txn.date)?.substring(0, 7);
}

/** Is the transaction in the given month? (dayjs month object) */
export function isInMonth(txn, month) {
  const d = dayjs(txn.effectiveDate || txn.date);
  return d.year() === month.year() && d.month() === month.month();
}
