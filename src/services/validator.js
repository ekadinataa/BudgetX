const MAX_STRING_LENGTH = 1000;
const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Trim all string values in an object (shallow).
 * Returns a new object with trimmed strings.
 * Array items that are strings are also trimmed.
 */
export function trimStrings(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const result = { ...obj };
  for (const key of Object.keys(result)) {
    if (typeof result[key] === 'string') {
      result[key] = result[key].trim();
    }
    if (Array.isArray(result[key])) {
      result[key] = result[key].map((item) =>
        typeof item === 'string' ? item.trim() : item
      );
    }
  }
  return result;
}

/**
 * Check if any string value in the object exceeds the max length.
 * Returns the field name that exceeds, or null if all are fine.
 */
export function findOversizedString(obj) {
  if (!obj || typeof obj !== 'object') return null;
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string' && value.length > MAX_STRING_LENGTH) {
      return key;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'string' && item.length > MAX_STRING_LENGTH) {
          return key;
        }
      }
    }
  }
  return null;
}

// --- Validation schemas ---

const WALLET_TYPES = ['bank', 'ewallet', 'credit', 'paylater', 'cash'];

function walletSchema(body) {
  if (!body.name || typeof body.name !== 'string' || body.name.trim() === '') {
    return 'Wallet name is required';
  }
  if (!WALLET_TYPES.includes(body.type)) {
    return `Wallet type must be one of: ${WALLET_TYPES.join(', ')}`;
  }
  if (typeof body.balance !== 'number' || Number.isNaN(body.balance)) {
    return 'Balance must be a valid number';
  }
  for (const field of ['creditLimit', 'heldAmount']) {
    if (body[field] !== undefined && (!Number.isFinite(body[field]) || body[field] < 0)) {
      return `${field} harus berupa angka nonnegatif dan terbatas`;
    }
  }
  if (!body.color || !HEX_COLOR_REGEX.test(body.color)) {
    return 'Color must be a valid hex color (e.g. #FF0000)';
  }
  if (body.note !== undefined && typeof body.note !== 'string') {
    return 'Note must be a string';
  }
  return null;
}

const TRANSACTION_TYPES = ['income', 'expense', 'transfer'];

function transactionSchema(body) {
  if (!body.date || typeof body.date !== 'string' || !DATE_REGEX.test(body.date)) {
    return 'Date must be in YYYY-MM-DD format';
  }
  if (!body.walletId || typeof body.walletId !== 'string' || body.walletId.trim() === '') {
    return 'Wallet ID is required';
  }
  if (!TRANSACTION_TYPES.includes(body.type)) {
    return `Transaction type must be one of: ${TRANSACTION_TYPES.join(', ')}`;
  }
  if (body.categoryId !== null && body.categoryId !== undefined && typeof body.categoryId !== 'string') {
    return 'Category ID must be a string or null';
  }
  if (typeof body.amount !== 'number' || Number.isNaN(body.amount) || body.amount <= 0) {
    return 'Amount must be a positive number';
  }
  if (typeof body.note !== 'string') {
    return 'Note must be a string';
  }
  if (!Array.isArray(body.tags) || !body.tags.every((t) => typeof t === 'string')) {
    return 'Tags must be an array of strings';
  }
  if (body.type === 'transfer') {
    if (!body.toWalletId || typeof body.toWalletId !== 'string' || body.toWalletId.trim() === '') {
      return 'Destination wallet ID (toWalletId) is required for transfers';
    }
  }
  return null;
}

const BUDGET_SECTIONS = ['needs', 'wants', 'savings'];

function budgetSchema(body) {
  if (typeof body.totalIncome !== 'number' || Number.isNaN(body.totalIncome) || body.totalIncome < 0) {
    return 'Total income must be a non-negative number';
  }
  if (!body.sections || typeof body.sections !== 'object') {
    return 'Sections object is required';
  }
  for (const section of BUDGET_SECTIONS) {
    const s = body.sections[section];
    if (!s || typeof s !== 'object') {
      return `Section "${section}" is required`;
    }
    if (typeof s.total !== 'number' || Number.isNaN(s.total) || s.total < 0) {
      return `Section "${section}" total must be a non-negative number`;
    }
    if (!Array.isArray(s.cats)) {
      return `Section "${section}" cats must be an array`;
    }
    for (const cat of s.cats) {
      if (!cat || typeof cat !== 'object') {
        return `Each category in "${section}" must be an object`;
      }
      if (typeof cat.id !== 'string' || cat.id.trim() === '') {
        return `Each category in "${section}" must have a string id`;
      }
      if (typeof cat.amt !== 'number' || Number.isNaN(cat.amt) || cat.amt < 0) {
        return `Each category amount in "${section}" must be a non-negative number`;
      }
    }
  }
  return null;
}

const CATEGORY_SECTIONS = ['needs', 'wants', 'savings', 'income'];

function categorySchema(body) {
  if (!body.name || typeof body.name !== 'string' || body.name.trim() === '') {
    return 'Category name is required';
  }
  if (!CATEGORY_SECTIONS.includes(body.section)) {
    return `Category section must be one of: ${CATEGORY_SECTIONS.join(', ')}`;
  }
  if (!body.color || !HEX_COLOR_REGEX.test(body.color)) {
    return 'Color must be a valid hex color (e.g. #FF0000)';
  }
  return null;
}

const VALID_PERIOD_MODES = ['month', 'cycle', 'range'];

function preferenceSchema(body) {
  if (typeof body.darkMode !== 'boolean') {
    return 'darkMode must be a boolean';
  }
  if (
    typeof body.cycleStart !== 'number' ||
    !Number.isInteger(body.cycleStart) ||
    body.cycleStart < 1 ||
    body.cycleStart > 28
  ) {
    return 'cycleStart must be an integer between 1 and 28';
  }
  if (typeof body.page !== 'string') {
    return 'page must be a string';
  }
  if (body.salaryAdjust !== undefined && typeof body.salaryAdjust !== 'boolean') {
    return 'salaryAdjust must be a boolean';
  }
  if (body.periodMode !== undefined && !VALID_PERIOD_MODES.includes(body.periodMode)) {
    return 'periodMode must be one of: month, cycle, range';
  }
  if (body.customRanges !== undefined && !Array.isArray(body.customRanges)) {
    return 'customRanges must be an array';
  }
  if (body.density !== undefined && !['compact', 'standard', 'relaxed'].includes(body.density)) return 'density tidak valid';
  if (body.radius !== undefined && !['sharp', 'soft', 'round'].includes(body.radius)) return 'radius tidak valid';
  for (const key of ['collapsed', 'yearMode']) {
    if (body[key] !== undefined && typeof body[key] !== 'boolean') return `${key} harus boolean`;
  }
  return null;
}

/**
 * Validate wallet data.
 * Trims strings, checks for oversized strings, then runs schema validation.
 * @param {object} data - Wallet data to validate
 * @returns {null|string} null on success, error string on failure
 */
export function validateWallet(data) {
  const trimmed = trimStrings(data);
  const oversizedField = findOversizedString(trimmed);
  if (oversizedField) {
    return `Field "${oversizedField}" exceeds maximum length of ${MAX_STRING_LENGTH} characters`;
  }
  return walletSchema(trimmed);
}

/**
 * Validate transaction data.
 * Trims strings, checks for oversized strings, then runs schema validation.
 * @param {object} data - Transaction data to validate
 * @returns {null|string} null on success, error string on failure
 */
export function validateTransaction(data) {
  const trimmed = trimStrings(data);
  const oversizedField = findOversizedString(trimmed);
  if (oversizedField) {
    return `Field "${oversizedField}" exceeds maximum length of ${MAX_STRING_LENGTH} characters`;
  }
  return transactionSchema(trimmed);
}

/**
 * Validate budget data.
 * Trims strings, checks for oversized strings, then runs schema validation.
 * @param {object} data - Budget data to validate
 * @returns {null|string} null on success, error string on failure
 */
export function validateBudget(data) {
  const trimmed = trimStrings(data);
  const oversizedField = findOversizedString(trimmed);
  if (oversizedField) {
    return `Field "${oversizedField}" exceeds maximum length of ${MAX_STRING_LENGTH} characters`;
  }
  return budgetSchema(trimmed);
}

/**
 * Validate category data.
 * Trims strings, checks for oversized strings, then runs schema validation.
 * @param {object} data - Category data to validate
 * @returns {null|string} null on success, error string on failure
 */
export function validateCategory(data) {
  const trimmed = trimStrings(data);
  const oversizedField = findOversizedString(trimmed);
  if (oversizedField) {
    return `Field "${oversizedField}" exceeds maximum length of ${MAX_STRING_LENGTH} characters`;
  }
  return categorySchema(trimmed);
}

/**
 * Validate a custom range period definition.
 * @param {{ start: string, end: string }} range
 * @returns {string|null} Error message or null if valid
 */
export function validateCustomRange(range) {
  if (!range.start || typeof range.start !== 'string' || !DATE_REGEX.test(range.start)) {
    return 'Start date must be in YYYY-MM-DD format';
  }
  if (!range.end || typeof range.end !== 'string' || !DATE_REGEX.test(range.end)) {
    return 'End date must be in YYYY-MM-DD format';
  }
  if (range.end <= range.start) {
    return 'End date must be after start date';
  }
  return null;
}

/**
 * Validate preference data.
 * Trims strings, checks for oversized strings, then runs schema validation.
 * @param {object} data - Preference data to validate
 * @returns {null|string} null on success, error string on failure
 */
export function validatePreference(data) {
  const trimmed = trimStrings(data);
  const oversizedField = findOversizedString(trimmed);
  if (oversizedField) {
    return `Field "${oversizedField}" exceeds maximum length of ${MAX_STRING_LENGTH} characters`;
  }
  return preferenceSchema(trimmed);
}
