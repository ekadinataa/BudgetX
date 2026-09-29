import { useState, useRef } from 'react';
import ResetConfirmModal from './ResetConfirmModal';
import ImportConfirmModal from './ImportConfirmModal';
import NavIcon from '../../components/icons/NavIcon';
import { buildBudgetXJson, downloadJson, downloadCsvZip } from '../../services/exportService';
import { parseAndValidate, validateEntities, parseCsvZip, parseTransactionCsv, parseWalletCsv, parseBudgetCsv, parseCsv } from '../../services/importService';
import styles from './SettingsPage.module.css';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const COLORS = [
  '#F59E0B', '#3B82F6', '#8B5CF6', '#EF4444', '#06B6D4',
  '#EC4899', '#F97316', '#EAB308', '#A855F7', '#14B8A6',
  '#64748B', '#22C55E', '#10B981', '#059669', '#6366F1',
  '#DC2626', '#16A34A', '#2563EB', '#9333EA', '#0891B2',
];

const SECTION_ORDER = ['needs', 'wants', 'savings', 'income'];
const SECTION_LABELS = {
  needs: 'Kebutuhan',
  wants: 'Keinginan',
  savings: 'Tabungan',
  income: 'Pemasukan',
};

/**
 * SettingsPage — App settings with Export, Import, Category Management, and Reset Data features.
 *
 * @param {Object} props
 * @param {() => Promise<void>} props.onResetData
 * @param {Array} props.wallets
 * @param {Array} props.transactions
 * @param {Object} props.budgets
 * @param {Array} props.categories
 * @param {Object} props.preferences
 * @param {(importData: Object, mode: string) => Promise<{ added?: number, skipped?: number }>} props.onImportData
 * @param {(msg: string) => void} props.showToast
 * @param {(data: Object) => Promise<Object>} props.onCreateCategory
 * @param {(id: string, data: Object) => Promise<Object>} props.onUpdateCategory
 * @param {(id: string) => Promise<void>} props.onDeleteCategory
 */
export default function SettingsPage({
  onResetData,
  wallets = [],
  transactions = [],
  budgets = {},
  categories = [],
  preferences = {},
  onImportData,
  showToast,
  onCreateCategory,
  onUpdateCategory,
  onDeleteCategory,
  setPage,
}) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [exportFormat, setExportFormat] = useState('json');
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importData, setImportData] = useState(null);
  const [importSummary, setImportSummary] = useState(null);
  const [showImportConfirm, setShowImportConfirm] = useState(false);
  const [importError, setImportError] = useState(null);
  const fileInputRef = useRef(null);

  // ── Multi-file CSV import state ─────────────────────────────────────
  const [csvFiles, setCsvFiles] = useState({
    transactions: null, // { file: File, name: string, rowCount: number, parsed: object }
    budgets: null,
    wallets: null,
  });
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvError, setCsvError] = useState(null);
  const csvTransactionsRef = useRef(null);
  const csvBudgetsRef = useRef(null);
  const csvWalletsRef = useRef(null);

  // ── Category collapse state ─────────────────────────────────────────
  const [collapsedSections, setCollapsedSections] = useState({});
  const toggleSection = (section) => {
    setCollapsedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  // ── Category management state ──────────────────────────────────────
  const [editingCatId, setEditingCatId] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', color: '' });
  const [addingSection, setAddingSection] = useState(null);
  const [addForm, setAddForm] = useState({ name: '', color: '#64748B' });

  // ── Export handler ─────────────────────────────────────────────────
  const handleExport = async () => {
    setExporting(true);
    try {
      const data = { wallets, transactions, budgets, categories, preferences };
      if (exportFormat === 'json') {
        const budgetkuJson = buildBudgetXJson(data);
        downloadJson(budgetkuJson);
      } else {
        downloadCsvZip(data);
      }
      if (showToast) showToast('Data berhasil diekspor');
    } catch {
      if (showToast) showToast(exportFormat === 'csv' ? 'Gagal membuat file CSV' : 'Gagal mengunduh file');
    } finally {
      setExporting(false);
    }
  };

  // ── Import handler (JSON/ZIP backup restore) ────────────────────────
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset file input so the same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = '';

    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      if (showToast) showToast('File terlalu besar (maks 10MB)');
      return;
    }

    const isZip = file.name.endsWith('.zip') || file.type === 'application/zip';

    if (isZip) {
      // Handle CSV ZIP import
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const zipBytes = new Uint8Array(event.target.result);
          const data = parseCsvZip(zipBytes);
          const validation = validateEntities(data);
          if (!validation.valid) {
            if (showToast) showToast(`Data tidak valid: ${validation.errors[0]}`);
            return;
          }

          const summary = {
            wallets: (data.wallets || []).length,
            transactions: (data.transactions || []).length,
            budgets: Object.keys(data.budgets || {}).length,
            categories: (data.categories || []).length,
          };

          setImportData(data);
          setImportSummary(summary);
          setImportError(null);
          setShowImportConfirm(true);
        } catch (err) {
          if (showToast) showToast(err.message);
        }
      };
      reader.onerror = () => {
        if (showToast) showToast('Gagal membaca file');
      };
      reader.readAsArrayBuffer(file);
    } else {
      // Handle JSON import
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const result = parseAndValidate(event.target.result);
          const validation = validateEntities(result.data);
          if (!validation.valid) {
            if (showToast) showToast(`Data tidak valid: ${validation.errors[0]}`);
            return;
          }

          const summary = {
            wallets: (result.data.wallets || []).length,
            transactions: (result.data.transactions || []).length,
            budgets: Object.keys(result.data.budgets || {}).length,
            categories: (result.data.categories || []).length,
          };

          setImportData(result.data);
          setImportSummary(summary);
          setImportError(null);
          setShowImportConfirm(true);
        } catch (err) {
          if (showToast) showToast(err.message);
        }
      };
      reader.onerror = () => {
        if (showToast) showToast('Gagal membaca file');
      };
      reader.readAsText(file);
    }
  };

  // ── Multi-file CSV handlers ─────────────────────────────────────────
  const handleCsvFileSelect = (slot, e) => {
    const file = e.target.files?.[0];
    // Reset file input
    const ref = slot === 'transactions' ? csvTransactionsRef : slot === 'budgets' ? csvBudgetsRef : csvWalletsRef;
    if (ref.current) ref.current.value = '';

    if (!file) return;

    if (file.size > MAX_FILE_SIZE) {
      if (showToast) showToast('File terlalu besar (maks 10MB)');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const csvString = event.target.result;
        let parsed;
        let rowCount;

        if (slot === 'wallets') {
          parsed = parseWalletCsv(csvString);
          rowCount = parsed.wallets.length;
        } else if (slot === 'budgets') {
          parsed = parseBudgetCsv(csvString, categories);
          rowCount = Object.keys(parsed.budgets).length;
        } else {
          // For transactions, just count rows for now (full parse needs wallets)
          const rows = parseCsv(csvString);
          rowCount = rows.length;
          parsed = { _rawCsv: csvString, rowCount };
        }

        setCsvFiles((prev) => ({
          ...prev,
          [slot]: { file, name: file.name, rowCount, parsed },
        }));
        setCsvError(null);
      } catch (err) {
        if (showToast) showToast(err.message);
      }
    };
    reader.onerror = () => {
      if (showToast) showToast('Gagal membaca file');
    };
    reader.readAsText(file);
  };

  const handleCsvFileRemove = (slot) => {
    setCsvFiles((prev) => ({ ...prev, [slot]: null }));
    setCsvError(null);
  };

  const csvHasAnyFile = csvFiles.transactions || csvFiles.budgets || csvFiles.wallets;

  const handleCsvImport = async () => {
    if (!csvHasAnyFile || !onImportData) return;
    setCsvImporting(true);
    setCsvError(null);

    try {
      let importedWalletCount = 0;
      let importedTxCount = 0;
      let importedBudgetCount = 0;
      let importedCatCount = 0;

      // Step 1: Import wallets first (if provided)
      if (csvFiles.wallets) {
        const { wallets: newWallets } = csvFiles.wallets.parsed;
        // Skip wallets that already exist by name
        const existingNames = new Set(wallets.map((w) => w.name.toLowerCase()));
        const walletsToAdd = newWallets.filter((w) => !existingNames.has(w.name.toLowerCase()));

        if (walletsToAdd.length > 0) {
          // Use append mode to add wallets
          await onImportData({
            wallets: walletsToAdd,
            transactions: [],
            budgets: {},
            categories: [],
          }, 'append');
          importedWalletCount = walletsToAdd.length;
        }
      }

      // Step 2: Import transactions (if provided) — needs wallets to exist
      if (csvFiles.transactions) {
        const csvString = csvFiles.transactions.parsed._rawCsv;
        // Re-parse with current wallets (which now include any newly added ones)
        // We need to get the latest wallets — they may have been updated by step 1
        // Since onImportData refreshes state, we use the wallets prop + newly added
        let currentWallets = [...wallets];
        if (csvFiles.wallets) {
          const { wallets: newWallets } = csvFiles.wallets.parsed;
          const existingNames = new Set(wallets.map((w) => w.name.toLowerCase()));
          const walletsToAdd = newWallets.filter((w) => !existingNames.has(w.name.toLowerCase()));
          currentWallets = [...currentWallets, ...walletsToAdd];
        }

        const result = parseTransactionCsv(csvString, currentWallets, categories);
        const txImportData = { ...result, _csvImport: true };
        await onImportData(txImportData, 'append');
        importedTxCount = result.transactions.length;
        importedCatCount += (result.newCategories || []).length;
      }

      // Step 3: Import budgets (if provided) — needs categories to exist
      if (csvFiles.budgets) {
        const { budgets: newBudgets, newCategories: budgetNewCats } = csvFiles.budgets.parsed;
        // Add new categories from budget import
        if (budgetNewCats && budgetNewCats.length > 0) {
          importedCatCount += budgetNewCats.length;
        }
        // Import budgets via append
        await onImportData({
          wallets: [],
          transactions: [],
          budgets: newBudgets,
          categories: budgetNewCats || [],
        }, 'append');
        importedBudgetCount = Object.keys(newBudgets).length;
      }

      // Show success toast
      const parts = [];
      if (importedWalletCount > 0) parts.push(`${importedWalletCount} dompet`);
      if (importedTxCount > 0) parts.push(`${importedTxCount} transaksi`);
      if (importedBudgetCount > 0) parts.push(`${importedBudgetCount} periode anggaran`);
      if (importedCatCount > 0) parts.push(`${importedCatCount} kategori baru`);

      if (showToast) {
        showToast(`Impor CSV selesai: ${parts.length > 0 ? parts.join(', ') : 'tidak ada data baru'}`);
      }

      // Reset CSV files state
      setCsvFiles({ transactions: null, budgets: null, wallets: null });
    } catch (err) {
      setCsvError(err.message || 'Gagal mengimpor data CSV');
    } finally {
      setCsvImporting(false);
    }
  };

  const handleImportConfirm = async (mode) => {
    if (!importData || !onImportData) return;
    // CSV imports always use append mode
    const effectiveMode = importData._csvImport ? 'append' : mode;
    setImporting(true);
    setImportError(null);
    try {
      const result = await onImportData(importData, effectiveMode);
      setShowImportConfirm(false);
      setImportData(null);
      setImportSummary(null);
      if (showToast) {
        if (importData._csvImport && result) {
          const parts = [`${result.added || 0} transaksi diimpor`];
          if (result.categoriesCreated > 0) {
            parts.push(`${result.categoriesCreated} kategori baru dibuat`);
          }
          showToast(`Impor CSV selesai: ${parts.join(', ')}`);
        } else if (effectiveMode === 'append' && result) {
          showToast(`Impor selesai: ${result.added || 0} ditambahkan, ${result.skipped || 0} dilewati`);
        } else {
          showToast('Data berhasil diimpor');
        }
      }
    } catch (err) {
      setImportError(err.message || 'Gagal mengimpor data');
    } finally {
      setImporting(false);
    }
  };

  const handleImportClose = () => {
    if (!importing) {
      setShowImportConfirm(false);
      setImportData(null);
      setImportSummary(null);
      setImportError(null);
    }
  };

  // ── Category management handlers ───────────────────────────────────
  const startEditCat = (cat) => {
    setEditingCatId(cat.id);
    setEditForm({ name: cat.name, color: cat.color });
    setAddingSection(null);
  };

  const cancelEditCat = () => {
    setEditingCatId(null);
    setEditForm({ name: '', color: '' });
  };

  const saveEditCat = async () => {
    if (!editForm.name.trim() || !onUpdateCategory) return;
    const cat = categories.find((c) => c.id === editingCatId);
    if (!cat) return;
    try {
      await onUpdateCategory(editingCatId, {
        name: editForm.name.trim(),
        section: cat.section,
        color: editForm.color,
      });
      if (showToast) showToast('Kategori berhasil diperbarui');
    } catch {
      // Error handled by App.jsx handler
    }
    setEditingCatId(null);
    setEditForm({ name: '', color: '' });
  };

  const handleDeleteCat = async (cat) => {
    if (!onDeleteCategory) return;

    // Check if category is used in transactions
    const usedInTx = transactions.filter((t) => t.categoryId === cat.id);
    // Check if category is used in budget allocations
    let usedInBudget = false;
    for (const budget of Object.values(budgets)) {
      if (!budget.sections) continue;
      for (const sec of Object.values(budget.sections)) {
        if (sec.cats && sec.cats.some((c) => c.id === cat.id)) {
          usedInBudget = true;
          break;
        }
      }
      if (usedInBudget) break;
    }

    if (usedInTx.length > 0 || usedInBudget) {
      const parts = [];
      if (usedInTx.length > 0) parts.push(`${usedInTx.length} transaksi`);
      if (usedInBudget) parts.push('alokasi budget');
      if (showToast) showToast(`Tidak dapat menghapus '${cat.name}' — sedang digunakan di ${parts.join(' dan ')}`);
      return;
    }

    const confirmed = window.confirm(`Hapus kategori '${cat.name}'?`);
    if (!confirmed) return;
    try {
      await onDeleteCategory(cat.id);
      if (showToast) showToast('Kategori berhasil dihapus');
    } catch {
      // Error handled by App.jsx handler
    }
  };

  const startAddCat = (section) => {
    setAddingSection(section);
    setAddForm({ name: '', color: '#64748B' });
    setEditingCatId(null);
  };

  const cancelAddCat = () => {
    setAddingSection(null);
    setAddForm({ name: '', color: '#64748B' });
  };

  const saveAddCat = async () => {
    if (!addForm.name.trim() || !addingSection || !onCreateCategory) return;
    try {
      await onCreateCategory({
        name: addForm.name.trim(),
        section: addingSection,
        color: addForm.color,
      });
      if (showToast) showToast('Kategori berhasil ditambahkan');
    } catch {
      // Error handled by App.jsx handler
    }
    setAddingSection(null);
    setAddForm({ name: '', color: '#64748B' });
  };

  return (
    <>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Pengaturan</h1>
      </div>

      {/* ── FIRE Calculator Link ─────────────────────────────────── */}
      {setPage && (
        <div className={styles.sectionCard} style={{ marginBottom: 16 }}>
          <h2 className={styles.sectionTitle}>Alat Keuangan</h2>
          <button
            className={styles.btnPrimary}
            onClick={() => setPage('help')}
            style={{ background: '#6366F1', display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', marginBottom: 10 }}
          >
            📖 Bantuan &amp; Panduan
          </button>
          <button
            className={styles.btnPrimary}
            onClick={() => setPage('fire')}
            style={{ background: '#F59E0B', display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}
          >
            🔥 Kalkulator FIRE
          </button>
        </div>
      )}

      {/* ── Export Section ──────────────────────────────────────────── */}
      <div className={styles.sectionCard} style={{ marginBottom: 16 }}>
        <h2 className={styles.sectionTitle}>Ekspor Data</h2>
        <p className={styles.sectionDesc}>
          Unduh semua data Anda (dompet, transaksi, anggaran, kategori, dan preferensi)
          sebagai file cadangan.
        </p>

        {/* Format selector */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 14,
            color: 'var(--text-1)',
            cursor: 'pointer',
            fontWeight: exportFormat === 'json' ? 600 : 400,
          }}>
            <input
              type="radio"
              name="exportFormat"
              value="json"
              checked={exportFormat === 'json'}
              onChange={() => setExportFormat('json')}
              style={{ accentColor: '#4F6EF7' }}
            />
            JSON
          </label>
          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 14,
            color: 'var(--text-1)',
            cursor: 'pointer',
            fontWeight: exportFormat === 'csv' ? 600 : 400,
          }}>
            <input
              type="radio"
              name="exportFormat"
              value="csv"
              checked={exportFormat === 'csv'}
              onChange={() => setExportFormat('csv')}
              style={{ accentColor: '#4F6EF7' }}
            />
            CSV (ZIP)
          </label>
        </div>

        <button
          className={styles.btnPrimary}
          onClick={handleExport}
          disabled={exporting}
          style={{ opacity: exporting ? 0.6 : 1, cursor: exporting ? 'not-allowed' : 'pointer' }}
        >
          {exporting ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                width: 14, height: 14,
                border: '2px solid rgba(255,255,255,0.3)',
                borderTopColor: '#fff',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
                display: 'inline-block',
              }} />
              Mengekspor...
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </span>
          ) : 'Ekspor'}
        </button>
      </div>

      {/* ── Import Cadangan Section (JSON/ZIP) ─────────────────────── */}
      <div className={styles.sectionCard} style={{ marginBottom: 16 }}>
        <h2 className={styles.sectionTitle}>Impor Cadangan</h2>
        <p className={styles.sectionDesc}>
          Pulihkan data dari file cadangan BudgetX (JSON atau ZIP).
        </p>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json,.zip"
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />

        <button
          className={styles.btnPrimary}
          onClick={() => fileInputRef.current?.click()}
          disabled={importing}
          style={{ opacity: importing ? 0.6 : 1, cursor: importing ? 'not-allowed' : 'pointer' }}
        >
          Pilih File
        </button>
      </div>

      {/* ── Import CSV Section (Multi-file) ────────────────────────── */}
      <div className={styles.sectionCard} style={{ marginBottom: 16 }}>
        <h2 className={styles.sectionTitle}>Impor Data CSV</h2>
        <p className={styles.sectionDesc}>
          Impor data dari file CSV. Pilih file yang ingin diimpor (minimal 1).
        </p>

        {/* Format examples toggle */}
        <details className={styles.formatExamples}>
          <summary className={styles.formatExamplesSummary}>📋 Lihat contoh format CSV</summary>
          <div className={styles.formatExamplesContent}>
            <div className={styles.formatExample}>
              <strong>📄 Transaksi:</strong>
              <pre>Tanggal,Tipe,Jumlah,Kategori,Sub Kategori,Dompet,Ke Dompet,Catatan{'\n'}2026-05-03,EXPENSE,38000,Kebutuhan,Makan,BRI - A,,Makan malam{'\n'}2026-05-01,INCOME,14000000,Pemasukan,Gaji,BRI - A,,{'\n'}2026-05-01,TRANSFER,200000,,,BRI - A,GoPay,</pre>
            </div>
            <div className={styles.formatExample}>
              <strong>📊 Budget:</strong>
              <pre>Periode,Total Pemasukan,Bagian,Kategori,Alokasi{'\n'}2026-05,15000000,Kebutuhan,Makan,2000000{'\n'}2026-05,15000000,Keinginan,Hobby,500000{'\n'}2026-05,15000000,Tabungan,Deposito,3000000</pre>
            </div>
            <div className={styles.formatExample}>
              <strong>💰 Dompet:</strong>
              <pre>Nama,Tipe,Saldo,Catatan{'\n'}BRI - A,Bank,5000000,Tabungan{'\n'}GoPay,E-Wallet,100000,{'\n'}Cash,Tunai,50000,</pre>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-5)', margin: '8px 0 0' }}>
              Tipe dompet: Bank, E-Wallet, Kartu Kredit, PayLater, Tunai<br/>
              Tipe transaksi: EXPENSE, INCOME, TRANSFER<br/>
              Bagian budget: Kebutuhan, Keinginan, Tabungan
            </p>
          </div>
        </details>

        {/* Transaksi slot */}
        <div className={styles.importSlot}>
          <span className={styles.importSlotIcon}>📄</span>
          <span className={styles.importSlotLabel}>Transaksi</span>
          {csvFiles.transactions ? (
            <div className={styles.importSlotFileInfo}>
              <span className={styles.importSlotCheck}>✅</span>
              <span className={styles.importSlotFile}>
                {csvFiles.transactions.name} ({csvFiles.transactions.rowCount} baris)
              </span>
              <button
                type="button"
                className={styles.importSlotRemove}
                onClick={() => handleCsvFileRemove('transactions')}
                aria-label="Hapus file transaksi"
              >
                ×
              </button>
            </div>
          ) : (
            <>
              <input
                ref={csvTransactionsRef}
                type="file"
                accept=".csv"
                onChange={(e) => handleCsvFileSelect('transactions', e)}
                style={{ display: 'none' }}
              />
              <button
                type="button"
                className={styles.importSlotBtn}
                onClick={() => csvTransactionsRef.current?.click()}
                disabled={csvImporting}
              >
                Pilih File
              </button>
              <span className={styles.importSlotFile}>(belum dipilih)</span>
            </>
          )}
        </div>

        {/* Budget slot */}
        <div className={styles.importSlot}>
          <span className={styles.importSlotIcon}>📊</span>
          <span className={styles.importSlotLabel}>Budget</span>
          {csvFiles.budgets ? (
            <div className={styles.importSlotFileInfo}>
              <span className={styles.importSlotCheck}>✅</span>
              <span className={styles.importSlotFile}>
                {csvFiles.budgets.name} ({csvFiles.budgets.rowCount} periode)
              </span>
              <button
                type="button"
                className={styles.importSlotRemove}
                onClick={() => handleCsvFileRemove('budgets')}
                aria-label="Hapus file budget"
              >
                ×
              </button>
            </div>
          ) : (
            <>
              <input
                ref={csvBudgetsRef}
                type="file"
                accept=".csv"
                onChange={(e) => handleCsvFileSelect('budgets', e)}
                style={{ display: 'none' }}
              />
              <button
                type="button"
                className={styles.importSlotBtn}
                onClick={() => csvBudgetsRef.current?.click()}
                disabled={csvImporting}
              >
                Pilih File
              </button>
              <span className={styles.importSlotFile}>(belum dipilih)</span>
            </>
          )}
        </div>

        {/* Dompet slot */}
        <div className={styles.importSlot}>
          <span className={styles.importSlotIcon}>💰</span>
          <span className={styles.importSlotLabel}>Dompet</span>
          {csvFiles.wallets ? (
            <div className={styles.importSlotFileInfo}>
              <span className={styles.importSlotCheck}>✅</span>
              <span className={styles.importSlotFile}>
                {csvFiles.wallets.name} ({csvFiles.wallets.rowCount} dompet)
              </span>
              <button
                type="button"
                className={styles.importSlotRemove}
                onClick={() => handleCsvFileRemove('wallets')}
                aria-label="Hapus file dompet"
              >
                ×
              </button>
            </div>
          ) : (
            <>
              <input
                ref={csvWalletsRef}
                type="file"
                accept=".csv"
                onChange={(e) => handleCsvFileSelect('wallets', e)}
                style={{ display: 'none' }}
              />
              <button
                type="button"
                className={styles.importSlotBtn}
                onClick={() => csvWalletsRef.current?.click()}
                disabled={csvImporting}
              >
                Pilih File
              </button>
              <span className={styles.importSlotFile}>(belum dipilih)</span>
            </>
          )}
        </div>

        {/* Error display */}
        {csvError && (
          <div style={{
            fontSize: 13,
            fontWeight: 600,
            color: '#F87171',
            background: 'rgba(220, 38, 38, 0.08)',
            borderRadius: 8,
            padding: '10px 14px',
            marginTop: 12,
          }}>
            {csvError}
          </div>
        )}

        {/* Import button */}
        <button
          className={styles.btnPrimary}
          onClick={handleCsvImport}
          disabled={!csvHasAnyFile || csvImporting}
          style={{
            marginTop: 16,
            opacity: (!csvHasAnyFile || csvImporting) ? 0.6 : 1,
            cursor: (!csvHasAnyFile || csvImporting) ? 'not-allowed' : 'pointer',
          }}
        >
          {csvImporting ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                width: 14, height: 14,
                border: '2px solid rgba(255,255,255,0.3)',
                borderTopColor: '#fff',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
                display: 'inline-block',
              }} />
              Mengimpor...
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </span>
          ) : 'Impor'}
        </button>
      </div>

      {/* ── Kelola Kategori Section ────────────────────────────────── */}
      <div className={styles.sectionCard} style={{ marginBottom: 16 }}>
        <h2 className={styles.sectionTitle}>Kelola Kategori</h2>
        <p className={styles.sectionDesc}>
          Atur kategori pengeluaran dan pemasukan Anda.
        </p>

        {SECTION_ORDER.map((section) => {
          const sectionCats = categories
            .filter((c) => c.section === section)
            .sort((a, b) => a.name.localeCompare(b.name, 'id'));
          const isCollapsed = collapsedSections[section];
          return (
            <div key={section} className={styles.catSection}>
              <button
                type="button"
                className={styles.catSectionTitle}
                onClick={() => toggleSection(section)}
              >
                <span>{SECTION_LABELS[section]} ({sectionCats.length})</span>
                <svg
                  width="14" height="14" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              {!isCollapsed && (
                <>
              {sectionCats.map((cat) => {
                if (editingCatId === cat.id) {
                  return (
                    <div key={cat.id} className={styles.catEditForm}>
                      <input
                        type="text"
                        value={editForm.name}
                        onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                        placeholder="Nama kategori"
                        autoFocus
                      />
                      <div className={styles.catColorPalette}>
                        {COLORS.map((col) => (
                          <button
                            key={col}
                            type="button"
                            className={`${styles.catColorSwatch} ${editForm.color === col ? styles.catColorSwatchSelected : ''}`}
                            style={{ background: col }}
                            onClick={() => setEditForm((f) => ({ ...f, color: col }))}
                            aria-label={`Warna ${col}`}
                          />
                        ))}
                      </div>
                      <div className={styles.catEditFormActions}>
                        <button type="button" onClick={saveEditCat}>Simpan</button>
                        <button type="button" onClick={cancelEditCat}>Batal</button>
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={cat.id} className={styles.catItem}>
                    <div
                      className={styles.catItemDot}
                      style={{ background: cat.color }}
                    />
                    <span className={styles.catItemName}>{cat.name}</span>
                    <div className={styles.catItemActions}>
                      <button
                        type="button"
                        onClick={() => startEditCat(cat)}
                        aria-label={`Edit ${cat.name}`}
                      >
                        <NavIcon name="edit" size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteCat(cat)}
                        aria-label={`Hapus ${cat.name}`}
                      >
                        <NavIcon name="trash" size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}

              {addingSection === section ? (
                <div className={styles.catEditForm}>
                  <input
                    type="text"
                    value={addForm.name}
                    onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Nama kategori baru"
                    autoFocus
                  />
                  <div className={styles.catColorPalette}>
                    {COLORS.map((col) => (
                      <button
                        key={col}
                        type="button"
                        className={`${styles.catColorSwatch} ${addForm.color === col ? styles.catColorSwatchSelected : ''}`}
                        style={{ background: col }}
                        onClick={() => setAddForm((f) => ({ ...f, color: col }))}
                        aria-label={`Warna ${col}`}
                      />
                    ))}
                  </div>
                  <div className={styles.catEditFormActions}>
                    <button type="button" onClick={saveAddCat}>Tambah</button>
                    <button type="button" onClick={cancelAddCat}>Batal</button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className={styles.catAddBtn}
                  onClick={() => startAddCat(section)}
                >
                  <NavIcon name="plus" size={13} /> Tambah Kategori
                </button>
              )}
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Reset Data Section ─────────────────────────────────────── */}
      <div className={styles.sectionCard}>
        <h2 className={styles.sectionTitle}>Reset Data</h2>
        <p className={styles.sectionDesc}>
          Menghapus semua data Anda secara permanen, termasuk dompet, transaksi,
          anggaran, kategori, dan preferensi. Data yang sudah dihapus tidak dapat
          dikembalikan.
        </p>
        <button
          className={styles.btnDanger}
          onClick={() => setShowConfirm(true)}
        >
          Reset Data
        </button>
      </div>

      {/* ── Modals ─────────────────────────────────────────────────── */}
      {showConfirm && (
        <ResetConfirmModal
          onConfirm={onResetData}
          onClose={() => setShowConfirm(false)}
        />
      )}

      {showImportConfirm && importSummary && (
        <ImportConfirmModal
          importSummary={importSummary}
          onConfirm={handleImportConfirm}
          onClose={handleImportClose}
          error={importError}
          loading={importing}
          isCsvImport={!!importData?._csvImport}
        />
      )}
    </>
  );
}
