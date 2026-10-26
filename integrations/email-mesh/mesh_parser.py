"""Deterministic evidence parser. No cloud writes, credentials, or models.

Registry aliases must be confirmed identities, never bank names or guessed ownership.
Unknown fees remain None; eligible means ready for parent validation, not posted.
"""
import re
from decimal import Decimal, InvalidOperation
from datetime import datetime, timezone
from email.utils import getaddresses, parsedate_to_datetime

CARDS = {'7305': 'TOKOPEDIA_CC', '2406': 'BRI_PLATINUM'}


def normalize_identity(value):
    return re.sub(r'\s+', ' ', str(value or '')).strip().casefold()


def money(value):
    if value is None:
        return None
    value = re.sub(r'^(?:(?:Rp|IDR)\s*)+', '', value.strip(), flags=re.I)
    if not re.fullmatch(r'(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{2})?', value):
        return None
    try:
        number = Decimal(value.replace('.', '').replace(',', '.'))
        return int(number) if number == number.to_integral_value() else None
    except InvalidOperation:
        return None


def parse_email(row, registry):
    if not isinstance(row, dict) or not isinstance(registry, dict):
        raise TypeError('row and registry must be dicts')
    body = row.get('body_normalized') or row.get('body_plain') or ''
    subject = row.get('subject') or ''
    if not isinstance(body, str) or not isinstance(subject, str) or not isinstance(row.get('from', ''), str):
        raise TypeError('body, subject, from must be strings')
    if not isinstance(registry.get('wallets', {}), dict) or not isinstance(registry.get('aliases', {}), dict):
        raise TypeError('wallets and aliases must be dicts')
    errors = []
    raw = {'body_normalized': body, 'subject': subject, 'from': row.get('from')}
    out = dict(is_transaction=False, eligible=False, event_type='unknown', status='unknown',
               source_wallet='UNRESOLVED', destination_wallet='UNRESOLVED', destination_flag='UNRESOLVED',
               source_identity=None, destination_identity=None, amount=None, currency='IDR',
               fee_displayed=None, fee_paid=None, total_debit=None, total_credit=None,
               reference=None, facility=None, notification_at=None, time_source='unknown',
               body_transaction_at=None, raw_fields=raw, validation_errors=errors,
               category_hint=None, note=subject,
               provenance={k: row.get(k) for k in ('account_id', 'gmail_message_id', 'thread_id')},
               ownership_candidates=[], collected_at=row.get('collected_at'))

    # ponytail: caller attaches Gmail internalDate; no hidden dataset I/O at runtime.
    for key in ('internalDate', 'timestamp', 'date'):
        value = row.get(key)
        if value is None or value == '':
            continue
        raw[key] = value
        try:
            if key == 'internalDate':
                stamp = datetime.fromtimestamp(int(value) / 1000, timezone.utc)
            elif key == 'timestamp':
                stamp = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
            else:
                stamp = parsedate_to_datetime(value)
            if stamp.tzinfo is None:
                raise ValueError('timezone missing')
            out.update(notification_at=stamp.astimezone(timezone.utc).isoformat(),
                       time_source={'internalDate': 'internalDate', 'timestamp': 'export_timestamp', 'date': 'header_date'}[key])
            break
        except (ValueError, TypeError, OverflowError, OSError):
            errors.append('invalid_notification_time:' + key)

    def text(label):
        m = re.search(r'(?:^|\n)' + label + r'[\sÂ:]*([^\n]+)', body, re.I)
        value = m.group(1).strip() if m else None
        raw[label] = value
        return value

    def amount(label):
        m = re.search(r'(?<!\w)' + label + r'(?!\w)[\sÂ:]*(?:(?:Rp|IDR)\s*)?[\d][\d.,]*(?:[A-Za-z]+)?', body, re.I)
        value = re.sub(r'^' + label + r'[\sÂ:]*', '', m.group(0), flags=re.I) if m else None
        raw[label] = value
        result = money(value)
        if value is not None and result is None:
            errors.append('invalid_money:' + label)
        return result

    def registered(wallet, identity=None, side='source'):
        # Explicit named/numbered endpoints require their own confirmed alias.
        if identity:
            # Reporter-local pocket names never become global account aliases.
            scoped = registry.get('reporter_aliases', {}).get(wallet, {})
            if wallet in registry.get('wallets', {}) and any(
                    normalize_identity(alias) == normalize_identity(identity) and target == wallet
                    for alias, target in scoped.items()):
                return wallet
            return wallet if resolve(identity, side) == wallet else 'UNRESOLVED'
        if wallet not in registry.get('wallets', {}):
            return 'UNRESOLVED'
        # ponytail: fail closed - require alias confirms ownership; add alias when wallet confirmed
        aliases = registry.get('aliases', {})
        if any((v == wallet or (isinstance(v, (list, tuple, set)) and wallet in v)) for v in aliases.values()):
            return wallet
        return 'UNRESOLVED'

    def resolve(identity, side):
        if not identity:
            return 'UNRESOLVED'
        candidates = {normalize_identity(identity)}
        for number in re.findall(r'[\dXx*][\dXx* ]{3,}[\dXx*]', identity):
            candidates.add(normalize_identity(number))
            candidates.add(re.sub(r'\s+', '', number).casefold())
        matches = set()
        for alias, targets in registry.get('aliases', {}).items():
            if normalize_identity(alias) in candidates or re.sub(r'\s+', '', str(alias)).casefold() in candidates:
                targets = [targets] if isinstance(targets, str) else targets
                if isinstance(targets, (list, tuple, set)):
                    matches.update(targets)
        if len(matches) == 1:
            target = next(iter(matches))
            if target == 'EXTERNAL' or target in registry.get('wallets', {}):
                return target
        out['ownership_candidates'].append({'side': side, 'identity': identity,
                                            'alias_keys': sorted(candidates), 'matches': sorted(matches)})
        return 'UNRESOLVED'

    senders = getaddresses([row.get('from', '')])
    superbank_sender = len(senders) == 1 and senders[0][1].casefold() == 'noreply@no-reply.superbank.id'
    krom_sender = len(senders) == 1 and senders[0][1].casefold() == 'noreply@krom.id'
    if superbank_sender and subject == 'Pembayaran QRIS berhasil':
        qris_labels = ('Nominal Bayar', 'Total Bayar', 'Sumber Dana', 'Metode Pembayaran',
                       'Penerima', 'Nama Acquirer', 'Merchant PAN', 'Terminal ID',
                       'Tanggal & waktu', 'ID Transaksi', 'RRN', 'Layanan Super Care')
        boundaries = '|'.join(map(re.escape, qris_labels))

        def qris_field(label, required=True):
            values = re.findall(r'^[ \t]*' + re.escape(label) + r'[ \t]*:?[ \t]*\n(.*?)'
                                r'(?=^[ \t]*(?:' + boundaries + r')[ \t]*:?[ \t]*$|\Z)',
                                body, re.I | re.M | re.S)
            raw[label] = values[0].strip() if len(values) == 1 else None
            if len(values) > 1:
                errors.append('ambiguous_label:' + label)
            elif not values and required:
                errors.append('missing_label:' + label)
            elif values and not raw[label]:
                errors.append('empty_label:' + label)
            return raw[label]

        def qris_money(label):
            value = qris_field(label)
            result = money(value)
            if result is None:
                errors.append('invalid_money:' + label)
            return result

        own, recipient = qris_field('Sumber Dana'), qris_field('Penerima')
        merchant = recipient.splitlines()[0].strip() if recipient else None
        if qris_field('Metode Pembayaran') != 'QRIS':
            errors.append('unknown_qris_method')
        scoped = registry.get('reporter_aliases', {}).get('SUPERBANK', {})
        targets = [target for alias, target in scoped.items()
                   if own and normalize_identity(alias) == normalize_identity(own)]
        source = 'SUPERBANK' if (targets and all(target == 'SUPERBANK' for target in targets)
                                 and 'SUPERBANK' in registry.get('wallets', {})) else 'UNRESOLVED'
        transaction_id, rrn = qris_field('ID Transaksi', required=False), qris_field('RRN', required=False)
        raw['transaction_id'] = transaction_id
        for label, value in (('ID Transaksi', transaction_id), ('RRN', rrn)):
            if value is not None and not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]*', value):
                errors.append('invalid_reference:' + label)
        if not (rrn or transaction_id):
            errors.append('missing_reference')
        out.update(is_transaction=True, event_type='qris_payment',
                   status='success' if re.search(r'Kamu berhasil bayar ', body, re.I) else 'unknown',
                   source_identity=own, source_wallet=source,
                   destination_identity=merchant, destination_wallet='EXTERNAL' if merchant else 'UNRESOLVED',
                   amount=qris_money('Nominal Bayar'), total_debit=qris_money('Total Bayar'),
                   reference=rrn or transaction_id, body_transaction_at=qris_field('Tanggal & waktu'),
                   note=subject + (' • ' + merchant if merchant else ''))
        if out['amount'] is not None and out['total_debit'] is not None and out['total_debit'] != out['amount']:
            errors.append('total_debit_conflict')
        summaries = re.findall(r'^[ \t]*Kamu berhasil bayar ([^\n]+?) ke ([^\n]+?) dari ([^\n]+?)\.[ \t]*$', body, re.I | re.M)
        if len(summaries) != 1:
            errors.append('ambiguous_or_missing_qris_summary')
        else:
            nominal, payee, pocket = summaries[0]
            if (money(nominal) != out['amount'] or normalize_identity(payee) != normalize_identity(merchant)
                    or normalize_identity(pocket) != normalize_identity(own)):
                errors.append('qris_summary_conflict')
    elif re.search(r'@(?:no-reply\.)?superbank\.id>?$', row.get('from', ''), re.I) and subject.startswith(('Transfer dari ', 'Transfer ke ')):
        incoming = subject.startswith('Transfer dari ')
        out.update(is_transaction=True, event_type='transfer_in' if incoming else 'transfer_out',
                   status='success' if re.search(r'udah masuk|berhasil transfer', body, re.I) else 'unknown')
        other = re.search(r'(?:Pengirim|Penerima)\s*\n+\s*(.+?)\s*\n+\s*([^\n]*•[^\n]+)', body, re.I)
        identity = ' • '.join(other.groups()) if other else None
        own_label = 'Dikirim ke' if incoming else 'Sumber Dana'
        own_block = re.search(r'(?:^|\n)' + own_label + r'[\s:]+(.+?)(?=\n\s*(?:Penerima|Tujuan|Tanggal & Waktu|ID Transaksi|No\. Referensi)\s*\n|$)', body, re.I | re.S)
        own = re.sub(r'\s*\n\s*', ' • ', own_block.group(1).strip()) if own_block else None
        raw[own_label] = own
        out.update(source_identity=identity if incoming else own, destination_identity=own if incoming else identity,
                   source_wallet=resolve(identity, 'source') if incoming else registered('SUPERBANK', own),
                   destination_wallet=registered('SUPERBANK', own, 'destination') if incoming else resolve(identity, 'destination'),
                   amount=amount('Nominal Transfer'), reference=text(r'No\. Referensi'),
                   body_transaction_at=text('Tanggal & Waktu'))
        raw['transaction_id'] = text('ID Transaksi')
        fee = re.search(r'BI-Fast\s*•\s*(Rp[\d.,]+)([^\n]*)', body, re.I)
        if fee:
            out['fee_displayed'] = money(fee.group(1))
            out['fee_paid'] = 0 if 'gratis' in fee.group(2).lower() else out['fee_displayed']
            raw['fee_raw'] = fee.group(0)
        out['total_credit'] = out['amount']
        if not incoming:
            out['total_debit'] = amount('Total')
    elif subject == 'Pembayaran KK BRI Berhasil' and re.search(r'@bri\.co\.id>?$', row.get('from', ''), re.I):
        out.update(is_transaction=True, event_type='credit_repayment')
        out['status'] = 'success' if re.search(r'Transaksi Berhasil', body, re.I) else 'unknown'
        card = text('Nomor Kartu')
        raw['card_number'] = card
        out['destination_identity'] = card
        out['destination_wallet'] = CARDS.get((card or '')[-4:], 'UNRESOLVED')
        out['facility'] = CARDS.get((card or '')[-4:])
        if out['destination_wallet'] not in registry.get('wallets', {}):
            out['destination_wallet'] = 'UNRESOLVED'
        out['amount'] = amount('Nominal')
        out['fee_displayed'] = out['fee_paid'] = amount('Biaya Admin')
        out['total_debit'] = amount('Total')
        out['total_credit'] = out['amount']
        out['reference'] = text('Nomor Referensi')
        out['body_transaction_at'] = text('Tanggal')
        source_block = re.search(r'(?:^|\n)Sumber Dana[\s:]+(.+?)(?=\n\s*(?:Jenis Transaksi|Nama Bank|Nomor Kartu|Nominal)\s*[:\n]|$)', body, re.I | re.S)
        source = re.search(r'[\dXx*][\dXx* ]{4,}', source_block.group(1)) if source_block else None
        out['source_identity'] = source.group(0).strip() if source else (source_block.group(1).strip() if source_block else None)
        out['source_wallet'] = registered('BRI', out['source_identity'])
    elif krom_sender and subject == 'Transaksi Tarik Tunai ATM Berhasil':
        summary_pattern = (r'^[ \t]*Penarikan tunai sebesar ([^\n]+?) dengan kartu '
                           r'\(([^\n()]+)\) berhasil\.[ \t]*$')
        summaries = re.findall(summary_pattern, body, re.M)
        # Only the summary carries financial fields in this supported template.
        # Conservatively reject extra labels, including inline/multiline variants,
        # without parsing them, resolving another endpoint or inventing totals.
        remainder = re.sub(summary_pattern, '', body, flags=re.M)
        if re.search(r'\b(?:Nomor\s+Kartu|No\.?\s+Kartu|Card|Kartu|Jumlah|Nominal|Amount|'
                     r'Biaya|Fees?|Charges?|Total|Debit|Debet|Credit|Kredit)\b', remainder, re.I):
            errors.append('unsupported_atm_financial_field')
        # No labelled status is supported here, regardless of its claimed value.
        # Existing negative/pending markers below still retain their status signal.
        if re.search(r'\bStatus\b', remainder, re.I):
            errors.append('unsupported_atm_status_field')
        out.update(is_transaction=True, event_type='expense',
                   destination_wallet='EXTERNAL', destination_identity='Tarik tunai ATM Krom')
        # Count even unsupported/case/whitespace variants before parsing the one
        # exact supported summary, so a second malformed summary cannot hide.
        if len(summaries) != 1 or len(re.findall(r'\bPenarikan\s+tunai\s+sebesar\b', body, re.I)) != 1:
            errors.append('ambiguous_or_missing_atm_summary')
        else:
            nominal, card = summaries[0]
            raw.update(amount_raw=nominal, card_number=card)
            nominal_amount = money(nominal) if re.fullmatch(r'Rp[ \t]*[\d.,]+', nominal) else None
            out.update(status='success', amount=nominal_amount, source_identity=card)
            if nominal_amount is None:
                errors.append('invalid_money:atm_summary')
            if re.fullmatch(r'(?:\*{4}[ \t]*){3}\d{4}', card):
                # Both explicit masked views identify this card; let the existing
                # resolver detect conflicts across full-mask and compact aliases.
                masked_views = card + ' • ****' + card[-4:]
                out['source_wallet'] = registered('KROM', masked_views)
            else:
                errors.append('invalid_atm_card')
        if re.search(r'\b(?:(?:tidak|belum)\s+(?:berhasil|sukses)|not\s+(?:successful|completed|succeeded))\b', remainder, re.I):
            errors.append('unsupported_atm_outcome')
            out['status'] = 'failed'
        elif re.search(r'\b(?:gagal|failed|ditolak|rejected|dibatalkan|cancelled|tidak\s+berhasil)\b', body, re.I):
            out['status'] = 'failed'
        elif re.search(r'\b(?:pending|menunggu|diproses|belum\s+berhasil|dalam\s+proses)\b', body, re.I):
            out['status'] = 'pending'
    elif subject in ('Transaksi Berhasil', 'Transaksi QRIS Berhasil', 'Transfer Berhasil', 'Dana Diterima') and re.search(r'@krom\.id>?$', row.get('from', ''), re.I):
        incoming = subject == 'Dana Diterima'
        def krom_endpoint(label):
            m = re.search(r'(?:^|\n)' + label + r':[ \t]*(.+?)(?=\n\s*(?:Ke|Dari|Metode transfer|Jumlah|Merchant|Tanggal & Waktu):|\n\s*Terima kasih|$)', body, re.I | re.S)
            value = re.sub(r'\s*\n\s*', ' • ', m.group(1).strip()) if m else None
            raw[label] = value
            return value

        source, dest = krom_endpoint('Dari'), krom_endpoint('Ke')
        out.update(is_transaction=True, source_identity=source, destination_identity=dest,
                   amount=amount('Jumlah'), body_transaction_at=text('Tanggal & Waktu'),
                   status='success' if re.search(r'telah berhasil|telah mengirim dana|telah menerima dana|telah melakukan pembayaran QRIS', body, re.I) else 'unknown')
        if subject == 'Dana Diterima':
            out.update(event_type='transfer_in', source_wallet=resolve(source, 'source'), destination_wallet=registered('KROM', dest, 'destination'))
        elif subject == 'Transfer Berhasil':
            out.update(event_type='transfer_out', source_wallet=registered('KROM', source), destination_wallet=resolve(dest, 'destination'))
        elif subject == 'Transaksi QRIS Berhasil':
            merchant = text('Merchant')
            out.update(event_type='qris_payment', source_wallet=registered('KROM', source),
                       destination_identity=merchant, destination_wallet='EXTERNAL' if merchant else 'UNRESOLVED')
        else:
            m = re.search(r'Transaksi (.+?) telah berhasil', body, re.I)
            subtype = m.group(1) if m else None
            raw['transaction_subtype'] = subtype
            events = {'E-Wallet': 'ewallet_topup', 'Isi ulang Token PLN': 'electricity_payment',
                      'Uang Elektronik': 'electronic_money_topup', 'Paket Data': 'data_payment',
                      'Pulsa': 'airtime_payment', 'PBB': 'tax_payment'}
            out.update(event_type=events.get(subtype, 'unknown'), source_wallet=registered('KROM', source))
            if subtype in ('Isi ulang Token PLN', 'Paket Data', 'Pulsa', 'PBB'):
                out.update(destination_wallet='EXTERNAL', destination_identity=subtype)
            if subtype not in events:
                errors.append('unknown_krom_subtype')
    elif 'Jago Pay from your Jago account' in subject and re.search(r'@jago\.com>?$', row.get('from', ''), re.I):
        m = re.search(r'You have made a payment of\s+(Rp[\d.,]+)\s+to\s+([^\n]+?)\.', body)
        out.update(is_transaction=True, event_type='partner_payment', source_wallet=registered('JAGO'))
        if m:
            raw.update(amount_raw=m.group(1), partner=m.group(2))
            out.update(amount=money(m.group(1)), destination_identity=m.group(2),
                       destination_wallet='EXTERNAL', status='success')
    elif subject == 'Penjualan Emas Berhasil' and re.search(r'@bri\.co\.id>?$', row.get('from', ''), re.I):
        asset = re.search(r'BANK BRI\s*\n\s*([\d ]+)', body, re.I)
        destination = re.search(r'BritAma\s*\n\s*([\d ]+)', body, re.I)
        identity = asset.group(1).strip() if asset else None
        out.update(is_transaction=True, event_type='gold_sale', status='success',
                   source_identity=identity, source_wallet=resolve(identity, 'source'),
                   destination_identity=destination.group(1).strip() if destination else None,
                   destination_wallet=registered('BRI', destination.group(1).strip() if destination else None, 'destination'), amount=amount('Nominal'),
                   fee_displayed=amount('Biaya Admin'), fee_paid=amount('Biaya Admin'),
                   total_credit=amount('Total Transaksi'), reference=text(r'No\. Ref'))
        if out['amount'] is not None and out['fee_paid'] is not None:
            if out['total_credit'] != out['amount'] - out['fee_paid']:
                errors.append('total_credit_conflict')
    elif subject == 'Notification BRI' and re.search(r'@bri\.co\.id>?$', row.get('from', ''), re.I):
        m = re.search(r'Kartu Kredit BRI\s*(\d+[xX*]+(\d{4}))\s+di\s+(.+?)\s+sejumlah\s+(Rp\s*[\d.,]+)\s+pada\s+([^\n]+)', body, re.I | re.S)
        out['is_transaction'] = True
        if m:
            card, suffix, merchant, nominal, at = m.groups()
            raw.update(card_number=card, card_last4=suffix, merchant=merchant.strip(), amount_raw=nominal)
            out.update(source_identity=card, destination_identity=merchant.strip(),
                       source_wallet=CARDS.get(suffix, 'UNRESOLVED'), destination_wallet='EXTERNAL',
                       facility=CARDS.get(suffix), amount=money(nominal), body_transaction_at=at.strip(),
                       status='hold' if 'TEMPORARY HOLD' in merchant.upper() else 'success')
            if out['source_wallet'] not in registry.get('wallets', {}):
                out['source_wallet'] = 'UNRESOLVED'
        out['event_type'] = 'authorization_hold' if out['status'] == 'hold' else 'credit_purchase'
    elif re.search(r'@jago\.com>?$', row.get('from', ''), re.I) and (subject.startswith('You have made ') or subject.startswith('You have done ') or subject in ('Your transaction is still in progress', 'Money has been reversed')):
        labels = r'From|To|Amount|Transaction Date|Transaction Status|Merchant Location|Tip Amount|Source of fund|Jago partner|Acquirer Name|Terminal ID|Customer PAN'

        def block(label):
            m = re.search(r'(?:^|\n)' + label + r':?\s*\n+(.+?)(?=\n+(?:' + labels + r'):?\s*\n|\n+You can|\n+From saving|$)', body, re.I | re.S)
            value = re.sub(r'\n+', ' • ', m.group(1).strip()) if m else None
            raw[label] = value
            return value

        source = block('From') or block('Source of fund')
        dest = block('To') or block('Jago partner')
        nominal = block('Amount')
        out.update(is_transaction=True, source_wallet=registered('JAGO', source) if source else 'UNRESOLVED', source_identity=source,
                   destination_identity=dest, amount=money(nominal), body_transaction_at=block('Transaction Date'))
        if subject.startswith('You have made a transfer'):
            out.update(event_type='transfer_out', destination_wallet=resolve(dest, 'destination'))
            if 'have transferred some money' in body:
                out['status'] = 'success'
        elif subject.startswith('You have made a payment to') or subject == 'Your transaction is still in progress':
            out.update(event_type='qris_payment', destination_wallet='EXTERNAL' if dest else 'UNRESOLVED')
            if 'have sent your money' in body or 'have successfully' in body:
                out['status'] = 'success'
        elif subject.startswith('You have made a transaction via '):
            out.update(event_type='partner_payment', destination_wallet='EXTERNAL' if dest else 'UNRESOLVED')
            if 'have made a transaction' in body or 'have successfully' in body:
                out['status'] = 'success'
        elif subject.startswith('You have done an e-Wallet'):
            out.update(event_type='ewallet_topup', destination_wallet=resolve(dest, 'destination'))
            if 'just did a top up' in body:
                out['status'] = 'success'
        elif subject == 'Money has been reversed':
            m = re.search(r'outgoing transfer of\s+(Rp\s*[\d.,]+)\s+to\s+(.+?)\s+has been reversed', body, re.I)
            out.update(event_type='reversal', status='reversal', source_wallet='EXTERNAL', destination_wallet=registered('JAGO', source, 'destination'))
            if m:
                out.update(amount=money(m.group(1)), source_identity=m.group(2), destination_identity=source)
                raw.update(amount_raw=m.group(1), reversal_counterparty=m.group(2))
        else:
            m = re.search(r'transaction of\s+(Rp\s*[\d.,]+)', body, re.I)
            out['event_type'] = 'card_purchase'
            if m:
                out.update(amount=money(m.group(1)), status='success')
        if subject == 'Your transaction is still in progress':
            out['status'] = 'pending'
        stated_status = block('Transaction Status')
        if stated_status:
            out['status'] = {'successful': 'success', 'success': 'success', 'pending': 'pending', 'failed': 'failed'}.get(stated_status.casefold(), 'unknown')
    elif re.search(r'@seabank\.co\.id>?$', row.get('from', ''), re.I) and subject.startswith('Notifikasi '):
        source = text('Transfer Dari')
        destination = text('Rekening Tujuan') or text('Transfer Ke')
        merchant = text('Nama Merchant')
        raw.update(va_number=text(r'No\. Virtual Account'), merchant=merchant, username=text('Username'))
        out.update(is_transaction=True, source_wallet=registered('SEABANK', source), source_identity=source,
                   destination_identity=destination or merchant, amount=amount('Jumlah'),
                   fee_displayed=amount('Biaya'), fee_paid=amount('Biaya'),
                   reference=text(r'No\. Referensi'), body_transaction_at=text('Waktu Transaksi'),
                   status='success' if re.search(r'(?:transfer|pembayaran|top up(?: e-Wallet)?) kamu (?:telah )?berhasil diproses', body, re.I) else 'unknown')
        if subject == 'Notifikasi Transfer SeaBank':
            out.update(event_type='transfer_out', destination_wallet=resolve(destination, 'destination'))
        elif 'QRIS' in subject:
            out.update(event_type='qris_payment', destination_wallet='EXTERNAL' if merchant else 'UNRESOLVED')
        elif 'Virtual Account' in subject or 'Top Up' in subject:
            out.update(event_type='virtual_account_payment' if 'Virtual Account' in subject else 'ewallet_topup',
                       destination_wallet=resolve(raw['va_number'] or merchant, 'destination'))
        elif 'Bayar Instan' in subject:
            out.update(event_type='merchant_payment', destination_wallet='EXTERNAL' if merchant else 'UNRESOLVED')
    elif re.search(r'@bri\.co\.id>?$', row.get('from', ''), re.I) and re.search(r'^(?:Pembayaran (?:QR|BRIVA|BPJS|MPN|PBB|Parkir)|Pembelian (?:QRIS|Token)|Top Up |Pemindahan Dana)', subject):
        source = re.search(r'(?:Sumber Dana|Rekening Sumber Dana)[\sÂ:]*((?:\d[\d* ]{4,})|(?:[^\n]*\n(?:[^\n]*\n)*?\s*[\d*][\d* ]{4,}))', body, re.I)
        source_value = re.search(r'\d[\d* ]{4,}', source.group(1)).group(0).strip() if source else None
        out.update(is_transaction=True, source_wallet=registered('BRI', source_value),
                   source_identity=source_value,
                   amount=amount('Jumlah Pokok') if 'PBB' in subject else amount('Nominal'),
                   fee_displayed=amount('Biaya Admin'), fee_paid=amount('Biaya Admin'),
                   total_debit=amount('Total') or amount('Total Transaksi'),
                   reference=text('Nomor Referensi') or text(r'No\. Ref'),
                   body_transaction_at=text('Tanggal Transaksi') or text('Tanggal'),
                   status='success' if 'Transaksi Berhasil' in body or re.search(r'Berikut ini adalah informasi transaksi yang telah Anda lakukan', body, re.I) else 'unknown')
        merchant = text('Nama Merchant') or text('Merchant/Biller') or text('Institusi') or text('Lokasi')
        raw['merchant'] = merchant
        dest = text('Nomor Tujuan')
        if 'QR' in subject:
            out.update(event_type='qris_payment', destination_identity=merchant,
                       destination_wallet='EXTERNAL' if merchant else 'UNRESOLVED')
        elif subject == 'Top Up BRIZZI Berhasil' and text('Jenis Transaksi') == 'Pembelian Online Brizzi':
            card = text('Nomor Kartu')
            if card and re.fullmatch(r'(?:\d[ ]*){16}', card):
                # BRIZZI is outside the approved mesh; its stored balance is not tracked.
                out.update(event_type='merchant_payment', destination_wallet='EXTERNAL',
                           destination_identity='BRIZZI • ' + re.sub(r'\s+', '', card))
                if source_value is None:
                    own = re.search(r'(?:^|\n)BRI\s*\n\s*([\d*][\d* ]{4,})', body)
                    out['source_identity'] = own.group(1).strip() if own else None
                    out['source_wallet'] = registered('BRI', out['source_identity']) if own else 'UNRESOLVED'
            else:
                out['event_type'] = 'ewallet_topup'
        elif subject.startswith('Pemindahan Dana') or subject.startswith('Top Up'):
            out.update(event_type='transfer_out' if subject.startswith('Pemindahan') else 'ewallet_topup',
                       destination_identity=dest, destination_wallet=resolve(dest, 'destination'))
        else:
            out.update(event_type='bill_payment', destination_identity=merchant,
                       destination_wallet='EXTERNAL' if merchant else 'UNRESOLVED')
        if out['amount'] is not None and out['fee_paid'] is not None and out['total_debit'] is not None:
            late = amount('Jumlah Denda') if 'PBB' in subject else 0
            if late is not None and out['total_debit'] != out['amount'] + out['fee_paid'] + late:
                errors.append('total_debit_conflict')
    if subject == 'Your QR payment has failed' and re.search(r'@jago\.com>?$', row.get('from', ''), re.I):
        out.update(is_transaction=True, event_type='qris_payment', status='failed', source_wallet=registered('JAGO'))
    excluded = re.search(r'e-Statement|e Statement|Deposito .* (?:Dibuat|Diperbarui|Jatuh Tempo)|Tenor Deposito|Penempatan Deposito|Pembayaran Setoran Awal|BPN atas ID Billing|Sosialisasi|Verifikasi|Aktivasi|Informasi Pemeliharaan|Suku Bunga|Limit Transfer|Perubahan batas|Survei|Survey', subject, re.I)
    if superbank_sender and re.search(r'\b(?:promo|cashback|diskon|penawaran)\b', subject, re.I):
        excluded = True
    if (not out['is_transaction'] and not excluded and superbank_sender
            and (re.search(r'^(?:Pembayaran|Transfer|Transaksi|Pembelian|Top Up|Notifikasi (?:Pembayaran|Transfer|Transaksi))\b', subject, re.I)
                 or (re.search(r'^\s*Detail Transaksi\s*$', body, re.I | re.M)
                     and re.search(r'^\s*(?:Nominal Bayar|Total Bayar|Nominal Transfer|Sumber Dana)\s*:?[ \t]*$', body, re.I | re.M)))):
        # An unsupported receipt must remain visible to quarantine/reparse, even
        # when its amount labels differ from the generic fallback below.
        out['is_transaction'] = True
        errors.append('unknown_template')
    if (not out['is_transaction'] and krom_sender
            and re.search(r'\b(?:tarik|penarikan)\s+tunai\b', subject, re.I)
            and re.search(r'\b(?:promo|cashback|diskon|penawaran|laporan bulanan)\b', subject, re.I)):
        excluded = True
    if (not out['is_transaction'] and not excluded and krom_sender
            and re.search(r'\b(?:tarik|penarikan)\s+tunai\b', subject, re.I)):
        out['is_transaction'] = True
        errors.append('unknown_template')
    if not out['is_transaction'] and not excluded:
        candidate_amount = amount('Nominal') or amount('Jumlah') or amount('Amount')
        if candidate_amount is not None and re.search(r'transfer|payment|pembayaran|transaksi|charged|reversed', body, re.I):
            out.update(is_transaction=True, amount=candidate_amount)
            errors.append('unknown_template')
    if out['is_transaction']:
        if out['event_type'] == 'qris_payment' and 'BRImo Transaction Details' in body and 'Berhasil' in subject:
            out['status'] = 'success'
        if not row.get('gmail_message_id'):
            errors.append('missing_gmail_message_id')
        if row.get('account_id') != 'akun-1':
            errors.append('inactive_account')
        if out['amount'] is not None and out['amount'] <= 0:
            errors.append('nonpositive_amount')
        if out['event_type'] == 'credit_repayment' and all(out[k] is not None for k in ('amount', 'fee_paid', 'total_debit')):
            if out['total_debit'] != out['amount'] + out['fee_paid']:
                errors.append('total_debit_conflict')
        if out['status'] != 'reversal':
            superbank_failed = superbank_sender and re.search(
                r'\b(?:Pembayaran QRIS|Kamu)\s+(?:gagal|ditolak)\b|'
                r'\bStatus(?: Transaksi| Pembayaran)?[\s:]*(?:gagal|failed|ditolak|rejected)\b', body, re.I)
            superbank_pending = superbank_sender and re.search(
                r'\bStatus(?: Transaksi| Pembayaran)?[\s:]*(?:diproses|pending|menunggu)\b', body, re.I)
            if superbank_failed or re.search(r'(?:transaksi|transaction|payment|pembayaran) (?:has )?(?:failed|gagal)|Transaction Status\s*[:\n]\s*(?:failed|rejected)', body, re.I):
                out['status'] = 'failed'
            elif superbank_pending or re.search(r'\bpending\b|still in progress|\bmenunggu\b', subject + '\n' + body, re.I):
                out['status'] = 'pending'
        if re.search(r'\$[a-z_]+', body):
            errors.append('unrendered_placeholder')
        if out['notification_at'] is None:
            errors.append('missing_notification_time')
        if out['amount'] is None:
            errors.append('missing_amount')
        if out['status'] != 'success':
            errors.append('status_not_success:' + out['status'])
        for side in ('source', 'destination'):
            if out[side + '_wallet'] == 'UNRESOLVED':
                errors.append('unresolved_' + side)
    if out['body_transaction_at'] is None:
        at = re.search(r'(?:^|\n)(\d{1,2}\s+\w+\s+\d{4}[^\n]*WIB)', body, re.I)
        if at:
            out['body_transaction_at'] = at.group(1).strip()
    labels = ('Nomor Referensi', 'No. Ref', 'No. Referensi', 'ID Transaksi', 'Jenis Transaksi',
              'Kode PAN Pelanggan', 'Merchant PAN', 'Customer PAN', 'Acquirer Name', 'Terminal ID',
              'Nomor Kartu', 'Nama Merchant', 'Lokasi Merchant',
              'Nama Penerbit', 'Nama Pengakuisisi QRIS', 'Nomor Pembayaran', 'Nama Pelanggan',
              'Nomor Objek Pajak', 'Kode Billing', 'NTPN', 'NTPD', 'Nama Deposito', 'Nomor Deposito',
              'Nama Tujuan', 'Bank Tujuan', 'Nomor Tujuan', 'Metode transfer', 'Jumlah Denda',
              'Keterangan', 'Tip Amount', 'Merchant Location', 'Transaction Status', 'Username',
              'No. Virtual Account', 'Produk', 'Nomor pesanan', 'Nominal', 'Jumlah', 'Biaya', 'Total')
    raw['labelled_fields'] = {}
    for label in labels:
        m = re.search(r'(?:^|\n)' + re.escape(label) + r'(?!\w)[\sÂ:]*([^\n]+)', body, re.I)
        if m:
            raw['labelled_fields'][label] = m.group(1).strip()
    if out['status'] == 'success' and out['amount'] is not None:
        if out['event_type'] in ('transfer_out', 'credit_repayment'):
            if out['total_credit'] is None:
                out['total_credit'] = out['amount']
                raw['total_credit_derived'] = True
        if out['event_type'] not in ('gold_sale', 'transfer_in', 'reversal'):
            if out['total_debit'] is None and out['fee_paid'] is not None and not any(e.startswith('invalid_money:Total') for e in errors):
                out['total_debit'] = out['amount'] + out['fee_paid']
                raw['total_debit_derived'] = True
    out['destination_flag'] = out['destination_wallet']
    out['eligible'] = out['is_transaction'] and not errors
    return out
