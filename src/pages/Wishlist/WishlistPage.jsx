import { useRef, useState } from 'react';
import { validateWishlistGroup, validateWishlistItem } from '../../services/wishlistValidator';
import WishlistItemEditor from './WishlistItemEditor';
import WishlistGroupEditor from './WishlistGroupEditor';
import WishlistDetail, { WishlistDetailFooter } from './WishlistDetail';
import { usePageActions } from '../../context/pageActions';
import useWishlistDate from './useWishlistDate';
import { summarizeWishlistGroup, summarizeWishlistGroups } from '../../utils/wishlistHelpers';
import { rp, fmtFull } from '../../utils/formatters';
import WishlistDialog from './WishlistDialog';
import NavIcon from '../../components/icons/NavIcon';


export default function WishlistPage({ wishlistGroups = [], loading = false, error = '', onRetry, onCreateGroup, onUpdateGroup, onDeleteGroup, onCreateItem, onUpdateItem, onDeleteItem }) {
  const now = useWishlistDate();
  const createActionRef = useRef(null);
  const [session, setSession] = useState(null);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const [operationError, setOperationError] = useState('');
  const selected = wishlistGroups.find(g => g.id === session?.groupId);
  const show = next => { if (pendingRef.current) return; setOperationError(''); setSession(next?.draft ? { ...next, initial: { ...next.draft } } : next); };
  const close = (destination = null) => {
    if (pendingRef.current) return;
    if (session.confirm === 'discard') { setSession(s => ({ ...s, confirm: null })); return; }
    if (session.draft && JSON.stringify(session.draft) !== JSON.stringify(session.initial)) setSession(s => ({ ...s, confirm: 'discard', destination }));
    else show(destination);
  };
  const create = () => show({ kind: 'group', draft: { title: '', targetBudget: '', targetDate: '' } });
  const editGroup = g => show({ kind: 'group', groupId: g.id, draft: { title: g.title, targetBudget: String(g.targetBudget), targetDate: g.targetDate } });
  const editItem = i => show({ kind: 'item', groupId: selected.id, itemId: i.id, draft: { name: i.name, price: String(i.price), notes: i.notes ?? '', priority: i.priority } });
  const change = (name, value) => setSession(s => ({ ...s, draft: { ...s.draft, [name]: value } }));
  const saveGroup = async event => {
    event.preventDefault();
    if (pendingRef.current) return;
    const data = { title: session.draft.title.trim(), targetBudget: Number(session.draft.targetBudget), targetDate: session.draft.targetDate };
    const stamp = new Date().toISOString();
    const error = validateWishlistGroup({ ...(selected || { id: 'draft', createdAt: stamp, updatedAt: stamp, items: [] }), ...data });
    if (error) { setOperationError(error); return; }
    pendingRef.current = true; setPending(true); setOperationError('');
    try {
      const saved = session.groupId ? await onUpdateGroup(session.groupId, data) : await onCreateGroup(data);
      if (!saved?.id) throw new Error('Wishlist belum tersimpan. Coba lagi.');
      setSession({ kind: 'detail', groupId: saved.id, waiting: true });
    } catch (error) { setOperationError(error.message || 'Wishlist gagal disimpan. Coba lagi.'); }
    finally { pendingRef.current = false; setPending(false); }
  };
  const addItem = () => show({ kind: 'item', groupId: selected.id, draft: { name: '', price: '', notes: '', priority: 'medium' } });
  const saveItem = async event => {
    event.preventDefault();
    if (pendingRef.current) return;
    const rawNotes = session.draft.notes;
    const data = { name: session.draft.name.trim(), price: Number(session.draft.price), notes: typeof rawNotes === 'string' ? rawNotes.trim() : rawNotes, priority: session.draft.priority };
    const stamp = new Date().toISOString();
    const original = selected.items.find(item => item.id === session.itemId);
    const candidate = { ...original, ...data, id: session.itemId || crypto.randomUUID(), groupId: selected.id, createdAt: original?.createdAt ?? stamp, updatedAt: stamp };
    const error = validateWishlistItem({ ...candidate, notes: rawNotes }) || validateWishlistGroup({ ...selected, items: [...selected.items.filter(i => i.id !== session.itemId), candidate] });
    if (error) { setOperationError(error); return; }
    pendingRef.current = true; setPending(true); setOperationError('');
    try {
      if (session.itemId) await onUpdateItem(selected.id, session.itemId, data);
      else await onCreateItem(selected.id, data);
      setSession({ kind: 'detail', groupId: selected.id });
    } catch (error) { setOperationError(error.message || 'Item gagal disimpan. Coba lagi.'); }
    finally { pendingRef.current = false; setPending(false); }
  };
  const deleteGroup = g => show({ kind: 'deleteGroup', groupId: g.id, title: g.title, count: g.items.length });
  const deleteItem = i => show({ kind: 'deleteItem', groupId: selected.id, itemId: i.id, title: i.name });
  const confirmDelete = async () => {
    if (pendingRef.current) return;
    pendingRef.current = true; setPending(true); setOperationError('');
    try {
      if (session.kind === 'deleteGroup') { await onDeleteGroup(session.groupId); setSession(null); }
      else { await onDeleteItem(session.groupId, session.itemId); setSession({ kind: 'detail', groupId: session.groupId }); }
    } catch (error) { setOperationError(error.message || 'Gagal menghapus. Coba lagi.'); }
    finally { pendingRef.current = false; setPending(false); }
  };
  const action = <button ref={createActionRef} type="button" className="btnPrimary" onClick={create} disabled={pending || loading || Boolean(error)}><NavIcon name="plus" size={16} aria-hidden="true" />Buat Wishlist</button>;
  const topbarActions = usePageActions(action);
  const groups = [...wishlistGroups].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
  const overview = !loading && !error ? summarizeWishlistGroups(wishlistGroups) : null;
  return <section className="wishlistPage">
    {topbarActions || action}
    <div className="largeTitleBlock"><h1 className="largeTitle">Wishlist</h1><p className="pageSubtitle">Rencanakan keinginan, tentukan prioritas.</p></div>
    {overview && <section className="statGrid wishlistStats" aria-label="Ringkasan wishlist">
      <dl className="statCard"><dt className="statLabel">Kelompok Wishlist</dt><dd className="statValue num">{overview.count}</dd><dd className="statDetail">Rencana yang Anda buat</dd></dl>
      <dl className="statCard"><dt className="statLabel">Target Dana</dt><dd className="statValue num">{fmtFull(overview.targetBudget).replace(/\s/g, '')}</dd><dd className="statDetail">Total target semua kelompok</dd></dl>
      <dl className="statCard"><dt className="statLabel">Total Harga Item</dt><dd className="statValue num">{fmtFull(overview.total).replace(/\s/g, '')}</dd><dd className="statDetail">Estimasi pembelian, bukan pengeluaran</dd></dl>
    </section>}
    {loading ? <p role="status">Memuat wishlist…</p> : error ? <div className="errorBox" role="alert"><span>{error}</span>{onRetry && <button type="button" className="btnGhost" onClick={() => onRetry()}>Coba Lagi</button>}</div> : <section className="wishlistGroupSection" aria-labelledby="wishlist-groups-title">
      <h2 id="wishlist-groups-title" className="sectionTitle">Kelompok Wishlist</h2>
      {!groups.length ? <div className="emptyState">Belum ada wishlist. Buat kelompok untuk merencanakan pembelianmu.</div> : <div className="wishlistGrid">{groups.map(g => <button type="button" className="card wishlistCard wishlistOpen" key={g.id} aria-label={`Buka ${g.title}`} onClick={() => show({ kind: 'detail', groupId: g.id })}>
        <span className="wishlistCardHead"><span><span className="cardTitle">{g.title}</span><span className="cardSub">{g.items.length} item</span></span><NavIcon name="chevron" size={18} aria-hidden="true" /></span>
        <span className="wishlistCardAmounts"><span><span className="wishlistCardLabel">Total harga</span><span className="wishlistCardValue num">{rp(summarizeWishlistGroup(g).total)}</span></span><span><span className="wishlistCardLabel">Target dana</span><span className="wishlistCardValue num">{rp(g.targetBudget)}</span></span></span>
      </button>)}</div>}
      <p className="wishlistPageNotice">Target dana berlaku per kelompok. Wishlist tidak mengurangi saldo dompet.</p>
    </section>}
    {session && <WishlistDialog title={session.confirm === 'discard' ? 'Buang Perubahan?' : session.kind === 'deleteGroup' ? 'Hapus Wishlist?' : session.kind === 'deleteItem' ? 'Hapus Item?' : session.kind === 'group' ? (session.groupId ? 'Edit Wishlist' : 'Buat Wishlist') : session.kind === 'item' ? (session.itemId ? 'Edit Item' : 'Tambah Item') : selected?.title || 'Wishlist'} pending={pending} fallbackFocusRef={createActionRef} onClose={() => close()} footer={session.kind === 'detail' && !session.confirm && selected && <WishlistDetailFooter group={selected} pending={pending} onEditGroup={() => editGroup(selected)} onDeleteGroup={() => deleteGroup(selected)} />}>
      {operationError && <p className="errorBox" role="alert">{operationError}</p>}
      {session.groupId && !selected && !session.waiting && !pending && session.confirm !== 'discard' ? <p role="status">Wishlist tidak tersedia. Tutup popup dan muat ulang daftar.</p> : session.confirm === 'discard' ? <><p>Perubahan belum disimpan. Buang perubahan ini?</p><div className="modalActions"><button type="button" className="btnGhost" onClick={() => setSession(s => ({ ...s, confirm: null }))}>Lanjutkan Mengedit</button><button type="button" className="btnDanger" onClick={() => show(session.destination)}>Buang Perubahan</button></div></> : ['deleteGroup', 'deleteItem'].includes(session.kind) ? <><p>{session.kind === 'deleteGroup' ? `Hapus “${session.title}” beserta ${session.count} item? Tindakan ini tidak dapat dibatalkan.` : `Hapus “${session.title}” dari wishlist ini?`}</p><div className="modalActions"><button type="button" className="btnGhost" disabled={pending} onClick={() => show({ kind: 'detail', groupId: session.groupId })}>Batal</button><button type="button" className="btnDanger" disabled={pending} onClick={confirmDelete}>Hapus</button></div></> : session.kind === 'group' ? <WishlistGroupEditor draft={session.draft} editing={Boolean(session.groupId)} onChange={change} onSubmit={saveGroup} onCancel={() => close(session.groupId ? { kind: 'detail', groupId: session.groupId } : null)} pending={pending} /> : session.kind === 'item' ? <WishlistItemEditor draft={session.draft} groupTitle={selected?.title} onChange={change} onSubmit={saveItem} onCancel={() => close({ kind: 'detail', groupId: session.groupId })} pending={pending} /> : !selected ? <p role="status">Menunggu sinkronisasi wishlist…</p> : <WishlistDetail group={selected} now={now} pending={pending} onAddItem={addItem} onEditItem={editItem} onDeleteItem={deleteItem} />}
    </WishlistDialog>}
  </section>;
}
