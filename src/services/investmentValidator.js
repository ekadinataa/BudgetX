/**
 * Investment Validator — Validation functions for investment data.
 */

import { getInvestmentTransactions } from '../utils/investmentHelpers';

const VALID_ASSET_TYPES = ['deposito', 'saham', 'crypto', 'emas', 'reksadana', 'obligasi', 'p2p', 'lainnya'];

/**
 * Validate investment record data.
 *
 * @param {Object} data
 * @param {Object} [original] - Existing record for immutable asset-type checks
 * @returns {string|null} Error message or null if valid
 */
export function validateInvestment(data, original) {
  if (!data.name || typeof data.name !== 'string' || data.name.trim() === '') {
    return 'Nama investasi wajib diisi';
  }

  if (!data.assetType || !VALID_ASSET_TYPES.includes(data.assetType)) {
    return 'Jenis aset tidak valid';
  }

  if (original && data.assetType !== original.assetType
    && (original.transactions?.length > 0 || (original.assetType === 'deposito' && original.principal > 0))) {
    return 'Jenis aset tidak boleh diubah setelah memiliki saldo awal atau transaksi';
  }

  // Type-specific validation
  if (data.assetType === 'deposito') {
    if (data.principal !== undefined) {
      if (!Number.isSafeInteger(data.principal) || data.principal <= 0) return 'Nominal deposito harus berupa Rupiah bulat lebih dari 0';
      const date = data.depositDate;
      if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) return 'Tanggal penempatan tidak valid';
      if (data.maturityDate && data.maturityDate < date) return 'Tanggal jatuh tempo tidak boleh sebelum tanggal penempatan';
    }
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
 * @param {Object} [investment] - Replay full history before accepting a dated sell
 * @returns {string|null} Error message or null if valid
 */
export function validateInvestmentTransaction(data, type, maxSellUnits = Infinity, investment) {
  if (typeof data.units !== 'number' || isNaN(data.units) || data.units <= 0) {
    return 'Unit harus lebih dari 0';
  }

  if (typeof data.pricePerUnit !== 'number' || isNaN(data.pricePerUnit) || data.pricePerUnit <= 0) {
    return 'Harga per unit harus lebih dari 0';
  }

  if (!data.walletId || typeof data.walletId !== 'string' || data.walletId.trim() === '') {
    return 'Dompet wajib dipilih';
  }

  if (type === 'sell' && investment) {
    const date = data.date;
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)
      || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) {
      return 'Tanggal penjualan tidak valid';
    }
    // Append after same-day history, matching the stable order used by valuation.
    const history = [...getInvestmentTransactions(investment), { type: 'sell', units: data.units, date }]
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    let availableUnits = 0;
    for (const tx of history) {
      const units = tx.units || 0;
      const tolerance = Number.EPSILON * Math.max(1, Math.abs(availableUnits), units) * 8;
      if (tx.type === 'buy') availableUnits += units;
      if (tx.type === 'sell') {
        availableUnits -= units;
        if (availableUnits < -tolerance) return 'Unit jual melebihi posisi yang tersedia pada tanggal transaksi';
      }
    }
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
