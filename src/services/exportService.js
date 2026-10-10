/**
 * Export Service — Pure functions for exporting BudgetX data to JSON and CSV.
 *
 * No React or Firestore dependencies. Accepts data as arguments, returns results.
 * Uses fflate for ZIP creation of CSV bundles.
 */

import { zipSync } from 'fflate';

// ── JSON Export ──────────────────────────────────────────────────────

/**
 * Build a BudgetX_Format v1 JSON envelope from app data.
 * @param {Object} data - Complete snapshot, including optional collections and settings
 * @returns {{ budgetku: true, version: string, exportedAt: string, data: Object }}
 */
export function buildBudgetXJson(data) {
  return {
    budgetku: true,
    version: '1.0',
    exportedAt: new Date().toISOString(),
    data,
  };
}

/**
 * Trigger a browser file download from a Blob.
 * Creates a temporary <a> element, clicks it, then cleans up.
 * @param {Blob} blob
 * @param {string} filename
 */
export function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Serialize a BudgetX_Format object to JSON and trigger download.
 * Filename pattern: budgetku-export-YYYY-MM-DD.json
 * @param {Object} budgetkuJson - The BudgetX_Format envelope
 */
export function downloadJson(budgetkuJson) {
  const jsonString = JSON.stringify(budgetkuJson, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const date = new Date().toISOString().slice(0, 10);
  triggerDownload(blob, `budgetku-export-${date}.json`);
}

// ── CSV Export ───────────────────────────────────────────────────────

/**
 * Escape a CSV field value. Wraps in double quotes if the value contains
 * commas, double quotes, or newlines. Internal double quotes are escaped
 * by doubling them.
 * @param {*} value
 * @returns {string}
 */
export function escapeCsvField(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

/**
 * Build CSV strings for each entity type with human-readable headers and resolved names.
 * Each CSV string includes a UTF-8 BOM prefix and Indonesian column headers.
 * IDs are kept in a separate column for import compatibility.
 * @param {{ wallets?: Array, transactions?: Array, budgets?: Object, categories?: Array }} data
 * @returns {{ wallets: string, transactions: string, budgets: string, categories: string }}
 */
export function buildCsvStrings(data) {
  const BOM = '\uFEFF';

  // Build lookup maps for resolving IDs to names
  const walletMap = {};
  (data.wallets || []).forEach((w) => { walletMap[w.id] = w.name; });
  const categoryMap = {};
  (data.categories || []).forEach((c) => { categoryMap[c.id] = c.name; });

  const sectionLabelMap = { needs: 'Kebutuhan', wants: 'Keinginan', savings: 'Tabungan', income: 'Pemasukan' };
  const typeLabelMap = { income: 'Pemasukan', expense: 'Pengeluaran', transfer: 'Transfer', adjustment: 'Penyesuaian Saldo' };
  const walletTypeLabelMap = { bank: 'Bank', ewallet: 'E-Wallet', credit: 'Kartu Kredit', paylater: 'PayLater', cash: 'Tunai' };

  // Wallets CSV
  const walletsHeader = 'ID,Nama,Tipe,Saldo,Warna,Catatan,Plafon,Hold';
  const walletsRows = (data.wallets || []).map((w) =>
    [w.id, w.name, walletTypeLabelMap[w.type] || w.type, w.balance, w.color, w.note || '', w.creditLimit, w.heldAmount].map(escapeCsvField).join(',')
  );
  const walletsCsv = BOM + [walletsHeader, ...walletsRows].join('\n');

  // Transactions CSV
  const txHeader = 'ID,Tanggal,Dompet,Tipe,Kategori,Jumlah,Catatan,Tag,Dompet Tujuan,_walletId,_categoryId,_toWalletId,Saldo Sebelum,Saldo Sesudah';
  const txRows = (data.transactions || []).map((t) =>
    [
      t.id,
      t.date,
      walletMap[t.walletId] || t.walletId,
      typeLabelMap[t.type] || t.type,
      t.categoryId ? (categoryMap[t.categoryId] || t.categoryId) : '',
      t.amount,
      t.note || '',
      Array.isArray(t.tags) ? t.tags.join('|') : '',
      t.toWalletId ? (walletMap[t.toWalletId] || t.toWalletId) : '',
      t.walletId,
      t.categoryId || '',
      t.toWalletId || '',
      t.balanceBefore,
      t.balanceAfter,
    ].map(escapeCsvField).join(',')
  );
  const transactionsCsv = BOM + [txHeader, ...txRows].join('\n');

  // Budgets CSV (flattened)
  const budgetsHeader = 'Periode,Total Pemasukan,Bagian,Kategori,Alokasi,_categoryId';
  const budgetsRows = [];
  const budgetsObj = data.budgets || {};
  for (const [monthKey, budget] of Object.entries(budgetsObj)) {
    const totalIncome = budget.totalIncome || 0;
    const sections = budget.sections || {};
    for (const [sectionName, sectionData] of Object.entries(sections)) {
      const cats = sectionData.cats || [];
      for (const cat of cats) {
        budgetsRows.push(
          [
            monthKey,
            totalIncome,
            sectionLabelMap[sectionName] || sectionName,
            categoryMap[cat.id] || cat.id,
            cat.amt,
            cat.id,
          ].map(escapeCsvField).join(',')
        );
      }
    }
  }
  const budgetsCsv = BOM + [budgetsHeader, ...budgetsRows].join('\n');

  // Categories CSV
  const catsHeader = 'ID,Nama,Bagian,Warna';
  const catsRows = (data.categories || []).map((c) =>
    [c.id, c.name, sectionLabelMap[c.section] || c.section, c.color].map(escapeCsvField).join(',')
  );
  const categoriesCsv = BOM + [catsHeader, ...catsRows].join('\n');

  return {
    wallets: walletsCsv,
    transactions: transactionsCsv,
    budgets: budgetsCsv,
    categories: categoriesCsv,
  };
}

/**
 * Package CSV tables and an optional complete JSON snapshot into a ZIP.
 * @param {{ wallets: string, transactions: string, budgets: string, categories: string }} csvStrings
 * @param {Object} [backupData] - Complete snapshot for lossless backup restoration
 * @returns {Uint8Array} ZIP file bytes
 */
export function buildCsvZip(csvStrings, backupData) {
  const encoder = new TextEncoder();
  return zipSync({
    'wallets.csv': encoder.encode(csvStrings.wallets),
    'transactions.csv': encoder.encode(csvStrings.transactions),
    'budgets.csv': encoder.encode(csvStrings.budgets),
    'categories.csv': encoder.encode(csvStrings.categories),
    ...(backupData ? { 'backup.json': encoder.encode(JSON.stringify(buildBudgetXJson(backupData))) } : {}),
  });
}

/**
 * Build CSV ZIP and trigger download.
 * Filename pattern: budgetku-export-YYYY-MM-DD.csv.zip
 * @param {{ wallets: Array, transactions: Array, budgets: Object, categories: Array }} data
 */
export function downloadCsvZip(data) {
  const csvStrings = buildCsvStrings(data);
  const zipBytes = buildCsvZip(csvStrings, data);
  const blob = new Blob([zipBytes], { type: 'application/zip' });
  const date = new Date().toISOString().slice(0, 10);
  triggerDownload(blob, `budgetku-export-${date}.csv.zip`);
}
