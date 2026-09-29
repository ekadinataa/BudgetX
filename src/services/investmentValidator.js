/**
 * Investment Validator — Validation functions for investment data.
 */

const VALID_ASSET_TYPES = ['deposito', 'saham', 'crypto', 'emas', 'reksadana', 'obligasi', 'p2p', 'lainnya'];

/**
 * Validate investment record data.
 *
 * Note: this does NOT check whether `assetType` is allowed to change once the
 * record has transactions. That guard lives only in the UI (InvestmentFormModal
 * disables the select when `initial.transactions.length > 0`). Callers that
 * update an investment outside that form get no such protection.
 *
 * @param {Object} data
 * @returns {string|null} Error message or null if valid
 */
export function validateInvestment(data) {
  if (!data.name || typeof data.name !== 'string' || data.name.trim() === '') {
    return 'Nama investasi wajib diisi';
  }

  if (!data.assetType || !VALID_ASSET_TYPES.includes(data.assetType)) {
    return 'Jenis aset tidak valid';
  }

  // Type-specific validation
  if (data.assetType === 'deposito') {
    if (data.interestRate !== undefined && data.interestRate !== '' && Number(data.interestRate) < 0) {
      return 'Bunga tidak boleh negatif';
    }
  }

  return null;
}

/**
 * Validate buy/sell transaction data.
 * @param {Object} data - { units, pricePerUnit, walletId, date }
 * @param {'buy'|'sell'} type
 * @param {number} maxSellUnits - Max units available for sell
 * @returns {string|null} Error message or null if valid
 */
export function validateInvestmentTransaction(data, type, maxSellUnits = Infinity) {
  if (typeof data.units !== 'number' || isNaN(data.units) || data.units <= 0) {
    return 'Unit harus lebih dari 0';
  }

  if (typeof data.pricePerUnit !== 'number' || isNaN(data.pricePerUnit) || data.pricePerUnit <= 0) {
    return 'Harga per unit harus lebih dari 0';
  }

  if (!data.walletId || typeof data.walletId !== 'string' || data.walletId.trim() === '') {
    return 'Dompet wajib dipilih';
  }

  if (type === 'sell' && data.units > maxSellUnits) {
    return `Unit jual melebihi unit yang dimiliki (max: ${maxSellUnits})`;
  }

  return null;
}

/**
 * Validate current value update.
 * @param {number} value
 * @returns {string|null} Error message or null if valid
 */
export function validateCurrentValue(value) {
  if (typeof value !== 'number' || isNaN(value) || value < 0) {
    return 'Nilai harus 0 atau lebih';
  }
  return null;
}
