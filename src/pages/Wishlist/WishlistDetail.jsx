import NavIcon from '../../components/icons/NavIcon';
import { rp, fmtDate } from '../../utils/formatters';
import { sortWishlistItems, wishlistBudgetComparison, wishlistTargetLabel } from '../../utils/wishlistHelpers';

const priorities = { high: 'Tinggi', medium: 'Sedang', low: 'Rendah' };


export default function WishlistDetail({ group, now, pending, onAddItem, onEditItem, onDeleteItem }) {
  const { total, remaining, over, percent } = wishlistBudgetComparison(group);
  const targetLabel = wishlistTargetLabel(group.targetDate, now);
  return <>
    <div className="wishlistDetailSummary">
      <dl><dt className="statLabel">Total harga item</dt><dd className="statValue num">{rp(total)}</dd></dl>
      <dl><dt className="statLabel">Target dana</dt><dd className="statValue num">{rp(group.targetBudget)}</dd></dl>
    </div>
    <div className={`wishlistComparisonTrack${over ? ' wishlistComparisonOver' : ''}`} role="meter" aria-label="Perbandingan harga terhadap target dana" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-valuetext={`${rp(total)} dari target ${rp(group.targetBudget)}; perbandingan harga, bukan dana terkumpul.`}><span style={{ width: `${percent}%` }} /></div>
    <p className="wishlistComparisonNote"><span>{over ? 'Melebihi Anggaran' : remaining ? 'Sisa dari target' : 'Sesuai Target Anggaran'}</span>{(over || remaining) > 0 && <> <strong className="num">{rp(over || remaining)}</strong></>} · perbandingan harga, bukan dana terkumpul.</p>
    <div className="wishlistListHead"><h3 className="cardTitle">Daftar item · {group.items.length}</h3><button type="button" className="btnPrimary" onClick={onAddItem} disabled={pending}><NavIcon name="plus" size={16} aria-hidden="true" />Tambah Item</button></div>
    {!group.items.length ? <p className="emptyState">Belum ada item. Tambahkan rencana pembelian pertamamu.</p> : <div className="wishlistItemList">{sortWishlistItems(group.items).map(item => <article key={item.id} className="wishlistItem">
      <div className="wishlistItemHeading"><h4>{item.name}</h4><div className="wishlistItemMeta"><span className={`wishlistPriority wishlistPriority-${item.priority}`}>{priorities[item.priority]}</span></div>{item.notes?.trim() && <p className="wishlistItemNote">{item.notes}</p>}</div>
      <strong className="wishlistItemPrice num">{rp(item.price)}</strong>
      <div className="wishlistItemActions"><button type="button" className="btnSmallGhost" aria-label={`Edit item ${item.name}`} onClick={() => onEditItem(item)} disabled={pending}>Edit</button><button type="button" className="btnSmallDanger" aria-label={`Hapus item ${item.name}`} onClick={() => onDeleteItem(item)} disabled={pending}>Hapus</button></div>
    </article>)}</div>}
    <p className="wishlistDetailNotice">Estimasi belum termasuk ongkir. Wishlist tidak memindahkan saldo atau mencatat transaksi.</p>
    <details className="wishlistSchedule"><summary tabIndex={0}>Jadwal target</summary><p className="wishlistTargetDate">Tanggal Target <time dateTime={group.targetDate}>{fmtDate(group.targetDate)}</time>{['Lewat Target', 'Target Hari Ini'].includes(targetLabel) && <span className="wishlistDateBadge">{targetLabel}</span>}</p></details>
  </>;
}

export function WishlistDetailFooter({ group, pending, onEditGroup, onDeleteGroup }) {
  const { total } = wishlistBudgetComparison(group);
  return <footer className="wishlistTotals"><div className="wishlistFooterAmount"><span>Total harga</span><strong className="num">{rp(total)}</strong></div><div className="wishlistFooterActions"><button type="button" className="btnGhost" aria-label={`Edit wishlist ${group.title}`} onClick={onEditGroup} disabled={pending}>Edit Wishlist</button><button type="button" className="btnSmallDanger" aria-label={`Hapus wishlist ${group.title}`} onClick={onDeleteGroup} disabled={pending}>Hapus</button></div></footer>;
}
