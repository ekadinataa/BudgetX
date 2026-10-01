/**
 * Utility functions for formatting currency (IDR), dates (Indonesian locale),
 * and month keys.
 *
 * Requirements: 8.4, 8.5, 8.6
 */

/**
 * Full IDR currency format using Intl.NumberFormat.
 * Example: fmtFull(1500000) => "Rp1.500.000"
 *
 * @param {number} n - The number to format
 * @returns {string} Formatted IDR currency string
 */
export function fmtFull(n) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(n);
}

/**
 * Abbreviated format: "jt" for millions, "rb" for thousands.
 * Examples:
 *   fmt(1500000) => "1,5jt"
 *   fmt(500000)  => "500rb"
 *   fmt(800)     => "800"
 *
 * @param {number} n - The number to format
 * @returns {string} Abbreviated string
 */
export function fmt(n) {
  const abs = Math.abs(n);
  if (abs >= 1000000) {
    return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'jt';
  }
  if (abs >= 1000) {
    return (n / 1000).toFixed(0) + 'rb';
  }
  return n.toString();
}

/**
 * Indonesian locale date formatting.
 * Example: fmtDate("2026-04-19") => "19 Apr 2026"
 *
 * @param {string} d - Date string in "YYYY-MM-DD" format
 * @returns {string} Formatted date string in Indonesian locale
 */
export function fmtDate(d) {
  const date = new Date(d + 'T00:00:00');
  return date.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Indonesian currency with full digit grouping.
 * Example: rp(10825000) => "Rp10.825.000"
 *
 * This is the reference's `rp()`. Use it where the design shows a large
 * figure on its own (the balance hero, stat values) rather than the
 * abbreviated `fmt()`.
 *
 * @param {number} n
 * @returns {string}
 */
export function rp(n) {
  const v = Number(n) || 0;
  const grouped = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(
    Math.abs(v)
  );
  return `${v < 0 ? '-Rp' : 'Rp'}${grouped}`;
}

/**
 * Currency scaled to M / jt / rb.
 * Example: rpShort(1500000) => "Rp1,5jt", rpShort(800) => "Rp800"
 *
 * The reference's `rpShort()`, used in dense tables and inline figures.
 *
 * @param {number} n
 * @returns {string}
 */
export function rpShort(n) {
  const a = Math.abs(Number(n) || 0);
  const sign = n < 0 ? '-' : '';
  if (a >= 1e9) return `${sign}Rp${trimZero(a / 1e9)}M`;
  if (a >= 1e6) return `${sign}Rp${trimZero(a / 1e6)}jt`;
  if (a >= 1e3) return `${sign}Rp${trimZero(a / 1e3)}rb`;
  return `${sign}Rp${a}`;
}

function trimZero(v) {
  return v.toFixed(Math.abs(v % 1) < 1e-9 ? 0 : 1).replace('.', ',');
}

/**
 * Returns a "YYYY-MM" string for the given date.
 * Example: monthKey(new Date(2026, 3, 19)) => "2026-04"
 *
 * @param {Date} date - A Date object
 * @returns {string} Month key in "YYYY-MM" format
 */
export function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}
