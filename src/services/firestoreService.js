/**
 * Firestore Service — Drop-in replacement for api.js
 *
 * All CRUD operations use the Firestore client SDK directly.
 * Auth is obtained from auth.currentUser.uid (no HTTP fetch, no tokens).
 */

import { db, auth } from '../config/firebase';
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  writeBatch,
  increment,
  query,
  where,
  limit,
} from 'firebase/firestore';
import {
  validateWallet,
  validateTransaction,
  validateBudget,
  validateCategory,
  validatePreference,
  trimStrings,
} from './validator';
import { CATEGORIES } from '../data/defaults';
import { BACKUP_EXTRA_KEYS, normalizeBackupData } from '../utils/backupHelpers.js';

// ── Internal helpers ─────────────────────────────────────────────────

/**
 * Returns the current user's UID.
 * Throws if not authenticated.
 */
function getUid() {
  const user = auth?.currentUser;
  if (!user) throw new Error('Not authenticated');
  return user.uid;
}

/**
 * Returns a collection reference under the current user's document.
 * e.g. userCol('wallets') → collection(db, 'users', uid, 'wallets')
 */
function userCol(sub) {
  const uid = getUid();
  return collection(db, 'users', uid, sub);
}

/**
 * Returns a document reference under the current user's document.
 * e.g. userDoc('wallets', 'w1') → doc(db, 'users', uid, 'wallets', 'w1')
 */
function userDoc(sub, id) {
  const uid = getUid();
  return doc(db, 'users', uid, sub, id);
}

/**
 * Get the balance adjustment for a transaction on its source wallet.
 * income  → +amount
 * expense → −amount
 * transfer → −amount (source wallet)
 */
function getBalanceEffect(type, amount) {
  if (type === 'income') return amount;
  if (type === 'expense') return -amount;
  if (type === 'transfer') return -amount;
  return 0;
}

/** Legacy transaction fields remain explicit; mesh metadata and future extras survive. */
function materializeTransaction(snapshot) {
  return {
    date: '', walletId: '', type: '', categoryId: null, amount: 0,
    note: '', tags: [], toWalletId: null,
    ...snapshot.data(), id: snapshot.id,
  };
}

/** One listener set per authenticated UID. Snapshots, not write responses, own state. */
export function subscribeUserData(uid, handlers, onError) {
  if (!uid || uid !== getUid()) throw new Error('Not authenticated');
  let active = true;
  const stops = [];
  const stop = () => {
    active = false;
    stops.forEach(unsubscribe => unsubscribe());
  };
  try {
    for (const key of ['wallets', 'transactions', 'categories']) {
      stops.push(onSnapshot(collection(db, 'users', uid, key), snapshot => {
        if (!active || auth?.currentUser?.uid !== uid) return;
        const records = snapshot.docs.map(d => key === 'transactions'
          ? materializeTransaction(d) : { ...d.data(), id: d.id });
        handlers[key](records);
      }, error => {
        if (active && auth?.currentUser?.uid === uid) onError(error);
      }));
    }
  } catch (error) {
    stop();
    throw error;
  }
  return stop;
}

// ── Wallets ──────────────────────────────────────────────────────────

export async function getWallets() {
  try {
    const snapshot = await getDocs(userCol('wallets'));
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    throw new Error(`Failed to read wallets: ${err.message}`);
  }
}

export async function createWallet(data) {
  const trimmed = trimStrings(data);
  const error = validateWallet(trimmed);
  if (error) throw new Error(error);

  const { name, type, balance, color, note } = trimmed;
  const walletData = { name, type, balance, color, note: note || '' };
  for (const field of ['creditLimit', 'heldAmount']) {
    if (trimmed[field] !== undefined) walletData[field] = trimmed[field];
  }

  try {
    const docRef = await addDoc(userCol('wallets'), walletData);
    return { id: docRef.id, ...walletData };
  } catch (err) {
    throw new Error(`Failed to create wallet: ${err.message}`);
  }
}

export async function updateWallet(id, data) {
  const trimmed = trimStrings(data);
  const error = validateWallet(trimmed);
  if (error) throw new Error(error);

  const { name, type, balance, color, note } = trimmed;
  const walletData = { name, type, balance, color, note: note || '' };
  for (const field of ['creditLimit', 'heldAmount']) {
    if (trimmed[field] !== undefined) walletData[field] = trimmed[field];
  }

  try {
    await updateDoc(userDoc('wallets', id), walletData);
    return { id, ...walletData };
  } catch (err) {
    throw new Error(`Failed to update wallet: ${err.message}`);
  }
}

export async function deleteWallet(id) {
  try {
    await deleteDoc(userDoc('wallets', id));
    return { success: true };
  } catch (err) {
    throw new Error(`Failed to delete wallet: ${err.message}`);
  }
}

// ── Transactions ─────────────────────────────────────────────────────

export async function getTransactions(filters = {}) {
  try {
    const { walletId, type, categoryId, startDate, endDate, tag, search } = filters;

    // Build Firestore query with where() clauses for supported fields
    let q = userCol('transactions');
    const constraints = [];

    if (walletId) constraints.push(where('walletId', '==', walletId));
    if (type) constraints.push(where('type', '==', type));
    if (categoryId) constraints.push(where('categoryId', '==', categoryId));

    if (constraints.length > 0) {
      q = query(q, ...constraints);
    }

    const snapshot = await getDocs(q);
    let transactions = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

    // In-memory filters
    if (startDate) {
      transactions = transactions.filter((tx) => tx.date >= startDate);
    }
    if (endDate) {
      transactions = transactions.filter((tx) => tx.date <= endDate);
    }
    if (tag) {
      transactions = transactions.filter(
        (tx) => Array.isArray(tx.tags) && tx.tags.includes(tag)
      );
    }
    if (search) {
      const searchLower = search.toLowerCase();
      transactions = transactions.filter(
        (tx) => tx.note && tx.note.toLowerCase().includes(searchLower)
      );
    }

    return transactions;
  } catch (err) {
    throw new Error(`Failed to read transactions: ${err.message}`);
  }
}

export async function createTransaction(data) {
  const trimmed = trimStrings(data);
  const error = validateTransaction(trimmed);
  if (error) throw new Error(error);

  const uid = getUid();
  const { date, walletId, type, categoryId, amount, note, tags, toWalletId } = trimmed;

  const txData = {
    date,
    walletId,
    type,
    categoryId: categoryId || null,
    amount,
    note,
    tags: tags || [],
    toWalletId: toWalletId || null,
  };

  try {
    const batch = writeBatch(db);

    // 1. Create the transaction document
    const txRef = doc(collection(db, 'users', uid, 'transactions'));
    batch.set(txRef, txData);

    // 2. Adjust source wallet balance
    const walletRef = doc(db, 'users', uid, 'wallets', walletId);
    batch.update(walletRef, {
      balance: increment(getBalanceEffect(type, amount)),
    });

    // 3. For transfers, also adjust destination wallet
    if (type === 'transfer' && toWalletId) {
      const toWalletRef = doc(db, 'users', uid, 'wallets', toWalletId);
      batch.update(toWalletRef, {
        balance: increment(amount),
      });
    }

    await batch.commit();
    return { id: txRef.id, ...txData };
  } catch (err) {
    throw new Error(`Batch operation failed (create transaction): ${err.message}`);
  }
}

export async function updateTransactionCategory(id, categoryId) {
  if (categoryId != null && (typeof categoryId !== 'string' || categoryId.length > 1000)) {
    throw new Error('Kategori tidak valid');
  }
  const normalized = categoryId?.trim() || null;
  const data = {
    categoryId: normalized, category_source: 'manual',
    category_status: normalized ? 'classified' : 'unclassified',
  };
  try {
    await updateDoc(userDoc('transactions', id), data);
    return { id, ...data };
  } catch (error) {
    throw new Error(`Failed to update transaction category: ${error.message}`);
  }
}

export async function updateTransaction(id, data) {
  const trimmed = trimStrings(data);
  const error = validateTransaction(trimmed);
  if (error) throw new Error(error);

  const uid = getUid();

  // Read old transaction to reverse its effects
  const txRef = doc(db, 'users', uid, 'transactions', id);
  let oldTx;
  try {
    const txDoc = await getDoc(txRef);
    if (!txDoc.exists()) {
      throw new Error('Transaction not found');
    }
    oldTx = txDoc.data();
  } catch (err) {
    throw new Error(`Failed to read transaction: ${err.message}`);
  }

  const { date, walletId, type, categoryId, amount, note, tags, toWalletId } = trimmed;

  const newData = {
    date,
    walletId,
    type,
    categoryId: categoryId || null,
    amount,
    note,
    tags: tags || [],
    toWalletId: toWalletId || null,
  };

  try {
    const batch = writeBatch(db);

    // A user category edit takes precedence over future mesh classification.
    if ((oldTx.categoryId || null) !== newData.categoryId) {
      newData.category_source = 'manual';
      newData.category_status = newData.categoryId ? 'classified' : 'unclassified';
    }
    // 1. Update the transaction document; omitted mesh fields remain intact.
    batch.update(txRef, newData);

    // 2. Reverse old transaction's effect on source wallet
    const oldWalletRef = doc(db, 'users', uid, 'wallets', oldTx.walletId);
    batch.update(oldWalletRef, {
      balance: increment(-getBalanceEffect(oldTx.type, oldTx.amount)),
    });

    // 3. Reverse old transfer destination effect
    if (oldTx.type === 'transfer' && oldTx.toWalletId) {
      const oldToWalletRef = doc(db, 'users', uid, 'wallets', oldTx.toWalletId);
      batch.update(oldToWalletRef, {
        balance: increment(-oldTx.amount),
      });
    }

    // 4. Apply new transaction's effect on source wallet
    const newWalletRef = doc(db, 'users', uid, 'wallets', walletId);
    batch.update(newWalletRef, {
      balance: increment(getBalanceEffect(type, amount)),
    });

    // 5. Apply new transfer destination effect
    if (type === 'transfer' && toWalletId) {
      const newToWalletRef = doc(db, 'users', uid, 'wallets', toWalletId);
      batch.update(newToWalletRef, {
        balance: increment(amount),
      });
    }

    await batch.commit();
    return { id, ...newData };
  } catch (err) {
    throw new Error(`Batch operation failed (update transaction): ${err.message}`);
  }
}

export async function deleteTransaction(id) {
  const uid = getUid();

  // Read the transaction to reverse its effects
  const txRef = doc(db, 'users', uid, 'transactions', id);
  let txData;
  try {
    const txDoc = await getDoc(txRef);
    if (!txDoc.exists()) {
      throw new Error('Transaction not found');
    }
    txData = txDoc.data();
  } catch (err) {
    throw new Error(`Failed to read transaction: ${err.message}`);
  }

  try {
    const batch = writeBatch(db);

    // 1. Delete the transaction
    batch.delete(txRef);

    // 2. Reverse the balance effect on source wallet
    const walletRef = doc(db, 'users', uid, 'wallets', txData.walletId);
    batch.update(walletRef, {
      balance: increment(-getBalanceEffect(txData.type, txData.amount)),
    });

    // 3. Reverse transfer destination effect
    if (txData.type === 'transfer' && txData.toWalletId) {
      const toWalletRef = doc(db, 'users', uid, 'wallets', txData.toWalletId);
      batch.update(toWalletRef, {
        balance: increment(-txData.amount),
      });
    }

    await batch.commit();
    return { success: true };
  } catch (err) {
    throw new Error(`Batch operation failed (delete transaction): ${err.message}`);
  }
}

// ── Budgets ──────────────────────────────────────────────────────────

export async function getBudgets() {
  try {
    const snapshot = await getDocs(userCol('budgets'));
    const budgets = {};
    snapshot.docs.forEach((d) => {
      budgets[d.id] = d.data();
    });
    return budgets;
  } catch (err) {
    throw new Error(`Failed to read budgets: ${err.message}`);
  }
}

export async function updateBudget(monthKey, data) {
  const error = validateBudget(data);
  if (error) throw new Error(error);

  const { totalIncome, sections } = data;
  const budgetData = { totalIncome, sections };

  try {
    await setDoc(userDoc('budgets', monthKey), budgetData);
    return budgetData;
  } catch (err) {
    throw new Error(`Failed to update budget: ${err.message}`);
  }
}

// ── Categories ───────────────────────────────────────────────────────

export async function getCategories() {
  try {
    const snapshot = await getDocs(userCol('categories'));
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    throw new Error(`Failed to read categories: ${err.message}`);
  }
}

export async function createCategory(data) {
  const trimmed = trimStrings(data);
  const error = validateCategory(trimmed);
  if (error) throw new Error(error);

  const { name, section, color } = trimmed;
  const catData = { name, section, color };

  try {
    const docRef = await addDoc(userCol('categories'), catData);
    return { id: docRef.id, ...catData };
  } catch (err) {
    throw new Error(`Failed to create category: ${err.message}`);
  }
}

export async function updateCategory(id, data) {
  const trimmed = trimStrings(data);
  const error = validateCategory(trimmed);
  if (error) throw new Error(error);

  const { name, section, color } = trimmed;
  const catData = { name, section, color };

  try {
    await updateDoc(userDoc('categories', id), catData);
    return { id, ...catData };
  } catch (err) {
    throw new Error(`Failed to update category: ${err.message}`);
  }
}

export async function deleteCategory(id) {
  try {
    await deleteDoc(userDoc('categories', id));
    return { success: true };
  } catch (err) {
    throw new Error(`Failed to delete category: ${err.message}`);
  }
}

// ── Preferences ──────────────────────────────────────────────────────

const DEFAULT_PREFERENCES = {
  darkMode: false,
  cycleStart: 1,
  salaryAdjust: false,
  page: 'dashboard',
  periodMode: 'month',
  customRanges: [],
};

export async function getPreferences() {
  try {
    const uid = getUid();
    const docRef = doc(db, 'users', uid, 'preferences', 'prefs');
    const snap = await getDoc(docRef);

    if (!snap.exists()) {
      return { ...DEFAULT_PREFERENCES };
    }

    return snap.data();
  } catch (err) {
    throw new Error(`Failed to read preferences: ${err.message}`);
  }
}

export async function updatePreferences(data) {
  const error = validatePreference(data);
  if (error) throw new Error(error);

  const { darkMode, cycleStart, salaryAdjust, page, periodMode, customRanges } = data;
  const prefsData = {
    darkMode,
    cycleStart,
    salaryAdjust: salaryAdjust ?? false,
    page,
    periodMode: periodMode ?? 'month',
    customRanges: customRanges ?? [],
  };
  for (const key of ['density', 'radius', 'collapsed', 'yearMode']) {
    if (data[key] !== undefined) prefsData[key] = data[key];
  }

  try {
    const uid = getUid();
    const docRef = doc(db, 'users', uid, 'preferences', 'prefs');
    await setDoc(docRef, prefsData, { merge: true });
    return prefsData;
  } catch (err) {
    throw new Error(`Failed to update preferences: ${err.message}`);
  }
}

// ── User Init ────────────────────────────────────────────────────────

export async function initUser() {
  try {
    const uid = getUid();

    // Check if user already has categories (proxy for "has data")
    const catQuery = query(
      collection(db, 'users', uid, 'categories'),
      limit(1)
    );
    const categoriesSnapshot = await getDocs(catQuery);

    if (!categoriesSnapshot.empty) {
      return { initialized: false, message: 'User already has data' };
    }

    // An empty category collection can be intentional, including an empty backup.
    // Its restored preferences distinguish that snapshot from a brand-new user.
    const prefsRef = doc(db, 'users', uid, 'preferences', 'prefs');
    const prefsSnapshot = await getDoc(prefsRef);
    if (prefsSnapshot.exists()) {
      return { initialized: false, message: 'User already has data' };
    }

    // Write default categories and preferences in a batch
    const batch = writeBatch(db);

    for (const cat of CATEGORIES) {
      const { id, ...data } = cat;
      const ref = doc(db, 'users', uid, 'categories', id);
      batch.set(ref, data);
    }

    // Create default preferences
    batch.set(prefsRef, { ...DEFAULT_PREFERENCES });

    await batch.commit();

    return { initialized: true, message: 'Default data created' };
  } catch (err) {
    throw new Error(`Failed to initialize user: ${err.message}`);
  }
}

// ── Reset User Data ──────────────────────────────────────────────────

const BATCH_LIMIT = 500;

export async function resetUserData({ initializeDefaults = true } = {}) {
  try {
    const uid = getUid();
    const subcollections = ['wallets', 'transactions', 'budgets', 'categories', 'preferences', 'recurringItems', 'debts', 'investments', 'fixedAssets', 'subscriptions'];

    // Collect all document references for deletion
    const allRefs = [];
    for (const sub of subcollections) {
      const snapshot = await getDocs(collection(db, 'users', uid, sub));
      snapshot.docs.forEach((d) => allRefs.push(d.ref));
    }

    // Batch-delete all documents respecting the 500-operation batch limit
    for (let i = 0; i < allRefs.length; i += BATCH_LIMIT) {
      const batch = writeBatch(db);
      const chunk = allRefs.slice(i, i + BATCH_LIMIT);
      for (const ref of chunk) {
        batch.delete(ref);
      }
      await batch.commit();
    }

    // A backup replacement supplies its own categories and preferences.
    if (initializeDefaults) await initUser();

    return { success: true };
  } catch (err) {
    throw new Error(`Failed to reset user data: ${err.message}`);
  }
}

// ── Recurring Items ──────────────────────────────────────────────────

export async function getRecurringItems() {
  try {
    const snapshot = await getDocs(userCol('recurringItems'));
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    throw new Error(`Failed to read recurring items: ${err.message}`);
  }
}

export async function createRecurringItem(data) {
  const trimmed = trimStrings(data);
  const { name, categoryId, walletId, amount, durationDays, lastPurchaseDate, nextEstimateDate, note, tags } = trimmed;

  if (!name || !name.trim()) throw new Error('Nama item wajib diisi');
  if (!amount || amount <= 0) throw new Error('Harga harus lebih dari 0');
  if (!durationDays || durationDays <= 0) throw new Error('Durasi harus lebih dari 0');

  const itemData = {
    name: name.trim(),
    categoryId: categoryId || '',
    walletId: walletId || '',
    amount: Number(amount),
    durationDays: Number(durationDays),
    lastPurchaseDate: lastPurchaseDate || '',
    nextEstimateDate: nextEstimateDate || '',
    isActive: true,
    note: note || '',
    tags: tags || [],
    createdAt: new Date().toISOString().slice(0, 10),
  };

  try {
    const docRef = await addDoc(userCol('recurringItems'), itemData);
    return { id: docRef.id, ...itemData };
  } catch (err) {
    throw new Error(`Failed to create recurring item: ${err.message}`);
  }
}

export async function updateRecurringItem(id, data) {
  try {
    const updateData = { ...data };
    // Ensure numeric fields
    if (updateData.amount !== undefined) updateData.amount = Number(updateData.amount);
    if (updateData.durationDays !== undefined) updateData.durationDays = Number(updateData.durationDays);
    await updateDoc(userDoc('recurringItems', id), updateData);
    return { id, ...updateData };
  } catch (err) {
    throw new Error(`Failed to update recurring item: ${err.message}`);
  }
}

export async function deleteRecurringItem(id) {
  try {
    await deleteDoc(userDoc('recurringItems', id));
    return { success: true };
  } catch (err) {
    throw new Error(`Failed to delete recurring item: ${err.message}`);
  }
}

// ── Debts ────────────────────────────────────────────────────────────

export async function getDebts() {
  try {
    const snapshot = await getDocs(userCol('debts'));
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    throw new Error(`Failed to read debts: ${err.message}`);
  }
}

export async function createDebt(data) {
  const trimmed = trimStrings(data);
  const { type, personName, totalAmount, remainingAmount, walletId, dueDate, description, status, payments, transactionId, createdAt } = trimmed;

  const debtData = {
    type,
    personName,
    totalAmount: Number(totalAmount),
    remainingAmount: Number(remainingAmount),
    walletId,
    dueDate: dueDate || '',
    description: description || '',
    status: status || 'active',
    payments: payments || [],
    transactionId: transactionId || '',
    createdAt: createdAt || new Date().toISOString().slice(0, 10),
    // Interest/annuity fields
    interestEnabled: data.interestEnabled || false,
    interestRate: Number(data.interestRate) || 0,
    tenorMonths: Number(data.tenorMonths) || 0,
    startDate: data.startDate || '',
    monthlyInstallment: Number(data.monthlyInstallment) || 0,
  };

  try {
    const docRef = await addDoc(userCol('debts'), debtData);
    return { id: docRef.id, ...debtData };
  } catch (err) {
    throw new Error(`Failed to create debt: ${err.message}`);
  }
}

export async function updateDebt(id, data) {
  try {
    const updateData = { ...data };
    if (updateData.totalAmount !== undefined) updateData.totalAmount = Number(updateData.totalAmount);
    if (updateData.remainingAmount !== undefined) updateData.remainingAmount = Number(updateData.remainingAmount);
    await updateDoc(userDoc('debts', id), updateData);
    return { id, ...updateData };
  } catch (err) {
    throw new Error(`Failed to update debt: ${err.message}`);
  }
}

export async function deleteDebt(id) {
  try {
    await deleteDoc(userDoc('debts', id));
    return { success: true };
  } catch (err) {
    throw new Error(`Failed to delete debt: ${err.message}`);
  }
}

// ── Investments ───────────────────────────────────────────────────────

export async function getInvestments() {
  try {
    const snapshot = await getDocs(userCol('investments'));
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    throw new Error(`Failed to read investments: ${err.message}`);
  }
}

export async function createInvestment(data) {
  const trimmed = trimStrings(data);
  const {
    name, assetType, notes, currentValue, transactions, createdAt, lastUpdated,
    // Type-specific fields are read straight off `data` below (see note there)
  } = trimmed;

  const investmentData = {
    name,
    assetType,
    notes: notes || '',
    currentValue: Number(currentValue) || 0,
    transactions: transactions || [],
    createdAt: createdAt || new Date().toISOString().slice(0, 10),
    lastUpdated: lastUpdated || new Date().toISOString().slice(0, 10),
    // Store ALL type-specific fields (learned from debt bug)
    interestRate: Number(data.interestRate) || 0,
    maturityDate: data.maturityDate || '',
    bankName: data.bankName || '',
    tickerSymbol: data.tickerSymbol || '',
    coinName: data.coinName || '',
    fundName: data.fundName || '',
    managerName: data.managerName || '',
    unit: data.unit || '',
  };

  try {
    const docRef = await addDoc(userCol('investments'), investmentData);
    return { id: docRef.id, ...investmentData };
  } catch (err) {
    throw new Error(`Failed to create investment: ${err.message}`);
  }
}

export async function updateInvestment(id, data) {
  try {
    const updateData = { ...data };
    if (updateData.currentValue !== undefined) updateData.currentValue = Number(updateData.currentValue);
    if (updateData.interestRate !== undefined) updateData.interestRate = Number(updateData.interestRate);
    await updateDoc(userDoc('investments', id), updateData);
    return { id, ...updateData };
  } catch (err) {
    throw new Error(`Failed to update investment: ${err.message}`);
  }
}

export async function deleteInvestment(id) {
  try {
    await deleteDoc(userDoc('investments', id));
    return { success: true };
  } catch (err) {
    throw new Error(`Failed to delete investment: ${err.message}`);
  }
}

// ── Subscriptions ─────────────────────────────────────────────────

export async function getSubscriptions() {
  try {
    const snapshot = await getDocs(userCol('subscriptions'));
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    throw new Error(`Failed to read subscriptions: ${err.message}`);
  }
}

export async function createSubscription(data) {
  const trimmed = trimStrings(data);
  const { name, category, amount, billingCycle, nextDueDate, walletId, note, isActive } = trimmed;

  if (!name || !name.trim()) throw new Error('Nama langganan wajib diisi');
  if (!amount || Number(amount) <= 0) throw new Error('Jumlah harus lebih dari 0');
  if (!nextDueDate) throw new Error('Tanggal jatuh tempo wajib diisi');

  const subscriptionData = {
    name: name.trim(),
    category: category || 'lainnya',
    amount: Number(amount),
    billingCycle: billingCycle || 'bulanan',
    nextDueDate: nextDueDate || '',
    walletId: walletId || '',
    note: note || '',
    isActive: isActive !== undefined ? isActive : true,
    createdAt: new Date().toISOString().slice(0, 10),
    lastPaidDate: '',
  };

  try {
    const docRef = await addDoc(userCol('subscriptions'), subscriptionData);
    return { id: docRef.id, ...subscriptionData };
  } catch (err) {
    throw new Error(`Failed to create subscription: ${err.message}`);
  }
}

export async function updateSubscription(id, data) {
  try {
    const updateData = { ...data };
    if (updateData.amount !== undefined) updateData.amount = Number(updateData.amount);
    await updateDoc(userDoc('subscriptions', id), updateData);
    return { id, ...updateData };
  } catch (err) {
    throw new Error(`Failed to update subscription: ${err.message}`);
  }
}

export async function deleteSubscription(id) {
  try {
    await deleteDoc(userDoc('subscriptions', id));
    return { success: true };
  } catch (err) {
    throw new Error(`Failed to delete subscription: ${err.message}`);
  }
}

// ── Fixed Assets ──────────────────────────────────────────────────────

export async function getFixedAssets() {
  try {
    const snapshot = await getDocs(userCol('fixedAssets'));
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    throw new Error(`Failed to read fixed assets: ${err.message}`);
  }
}

export async function createFixedAsset(data) {
  const assetData = {
    name: (data.name || '').trim(),
    category: data.category,
    purchasePrice: Number(data.purchasePrice),
    currentValue: Number(data.currentValue) || Number(data.purchasePrice),
    purchaseDate: data.purchaseDate || '',
    note: data.note || '',
    createdAt: new Date().toISOString().slice(0, 10),
  };

  try {
    const docRef = await addDoc(userCol('fixedAssets'), assetData);
    return { id: docRef.id, ...assetData };
  } catch (err) {
    throw new Error(`Failed to create fixed asset: ${err.message}`);
  }
}

export async function updateFixedAsset(id, data) {
  try {
    const updateData = { ...data };
    if (updateData.purchasePrice !== undefined) updateData.purchasePrice = Number(updateData.purchasePrice);
    if (updateData.currentValue !== undefined) updateData.currentValue = Number(updateData.currentValue);
    await updateDoc(userDoc('fixedAssets', id), updateData);
    return { id, ...updateData };
  } catch (err) {
    throw new Error(`Failed to update fixed asset: ${err.message}`);
  }
}

export async function deleteFixedAsset(id) {
  try {
    await deleteDoc(userDoc('fixedAssets', id));
    return { success: true };
  } catch (err) {
    throw new Error(`Failed to delete fixed asset: ${err.message}`);
  }
}

// ── Migration ────────────────────────────────────────────────────────

export async function migrateData(data) {
  try {
    const uid = getUid();
    const { wallets, transactions, budgets, categories } = data;

    // Collect all write operations as [ref, data] pairs
    const operations = [];

    // Wallets
    if (Array.isArray(wallets)) {
      for (const wallet of wallets) {
        for (const field of ['creditLimit', 'heldAmount']) {
          if (wallet[field] !== undefined && (!Number.isFinite(wallet[field]) || wallet[field] < 0)) {
            throw new Error(`${field} harus berupa angka nonnegatif dan terbatas`);
          }
        }
        const { id, outstanding, availableLimit, ...rest } = wallet;
        if (id) {
          const ref = doc(db, 'users', uid, 'wallets', id);
          operations.push({ ref, data: rest });
        }
      }
    }

    // Transactions
    if (Array.isArray(transactions)) {
      for (const tx of transactions) {
        const { id, ...rest } = tx;
        if (id) {
          const ref = doc(db, 'users', uid, 'transactions', id);
          operations.push({ ref, data: rest });
        }
      }
    }

    // Budgets (object keyed by monthKey)
    if (budgets && typeof budgets === 'object' && !Array.isArray(budgets)) {
      for (const [monthKey, budgetData] of Object.entries(budgets)) {
        const ref = doc(db, 'users', uid, 'budgets', monthKey);
        operations.push({ ref, data: budgetData });
      }
    }

    // Categories
    if (Array.isArray(categories)) {
      for (const cat of categories) {
        const { id, ...rest } = cat;
        if (id) {
          const ref = doc(db, 'users', uid, 'categories', id);
          operations.push({ ref, data: rest });
        }
      }
    }

    // Restore the remaining collections without replaying their wallet transactions.
    for (const key of BACKUP_EXTRA_KEYS) {
      for (const item of data[key] || []) {
        const { id, ...rest } = item;
        if (id) operations.push({ ref: doc(db, 'users', uid, key, id), data: rest });
      }
    }

    const prefsRef = doc(db, 'users', uid, 'preferences', 'prefs');
    if (data.preferences !== undefined) {
      operations.push({ ref: prefsRef, data: normalizeBackupData(data).preferences });
    } else {
      const prefsDoc = await getDoc(prefsRef);
      if (!prefsDoc.exists()) operations.push({ ref: prefsRef, data: { ...DEFAULT_PREFERENCES } });
    }
    if (data.fireSettings !== undefined) {
      operations.push({ ref: doc(db, 'users', uid, 'preferences', 'fire'), data: normalizeBackupData(data).fireSettings });
    }

    // Write in batches of BATCH_LIMIT
    for (let i = 0; i < operations.length; i += BATCH_LIMIT) {
      const batch = writeBatch(db);
      const chunk = operations.slice(i, i + BATCH_LIMIT);
      for (const op of chunk) {
        batch.set(op.ref, op.data);
      }
      await batch.commit();
    }

    return { success: true, imported: operations.length };
  } catch (err) {
    throw new Error(`Failed to migrate data: ${err.message}`);
  }
}
