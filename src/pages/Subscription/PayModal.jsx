import { useState } from 'react';
import Modal from '../../components/Modal/Modal';
import Field from '../../components/ui/Field';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import { fmtFull } from '../../utils/formatters';
import styles from './SubscriptionPage.module.css';

export default function PayModal({ subscription, wallets, onClose, onConfirm }) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [walletId, setWalletId] = useState(subscription.walletId || wallets[0]?.id || '');
  const [advanceDue, setAdvanceDue] = useState(true);

  const handleSubmit = (e) => {
    e.preventDefault();
    onConfirm({ date, walletId, advanceDueDate: advanceDue });
  };

  return (
    <Modal title="Bayar Langganan" onClose={onClose} width={400}>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 16, padding: '12px 16px', background: 'var(--bg-3)', borderRadius: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>
            {subscription.name}
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#4F6EF7', marginTop: 4 }}>
            {fmtFull(subscription.amount)}
          </div>
        </div>

        <Field label="Tanggal Pembayaran">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>

        <Field label="Dompet">
          <Select value={walletId} onChange={(e) => setWalletId(e.target.value)}>
            {wallets.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </Select>
        </Field>

        <label className={styles.checkbox}>
          <input
            type="checkbox"
            checked={advanceDue}
            onChange={(e) => setAdvanceDue(e.target.checked)}
          />
          Update tanggal jatuh tempo berikutnya
        </label>

        <button type="submit" className={styles.saveBtn} style={{ marginTop: 16 }}>
          Konfirmasi Pembayaran
        </button>
      </form>
    </Modal>
  );
}
