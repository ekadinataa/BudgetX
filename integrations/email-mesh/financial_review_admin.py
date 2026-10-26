"""Deterministic receipt admin ingress. No model, collector or publisher calls.

stdin protocol is for the trusted native Telegram plugin, not arbitrary chat tools.
Identity is supplied from raw Update metadata and revalidated here. Local approval
only authorizes the separate existing scheduled worker; it never writes to cloud.
"""
import os
import re
import sqlite3
from contextlib import closing
from pathlib import Path

from financial_review import ReviewStore, _endpoints

PROFILE_NAME = 'devops-budgetx'
ADMIN_ID = '790484718'
MAX_TEXT = 2048
REQUEST_FIELDS = {'profile_home', 'actor', 'message_id', 'bot_username', 'text'}
ACTOR = dict(platform='telegram', chat_id=ADMIN_ID, user_id=ADMIN_ID, is_bot=False, chat_type='dm')
TOKEN = r'[A-Za-z0-9_.-]{1,64}'


def parse_command(text, bot_username=None):
    """Strict single-line commands; never normalize malformed IDs or revisions."""
    if (not isinstance(text, str) or not 0 < len(text) <= MAX_TEXT or
            any(ord(c) < 32 or ord(c) == 127 for c in text)):
        raise ValueError('invalid_command')
    match = re.fullmatch(r'/(bxconfirm|bxretry|bxreject|bxreview)(?:@([A-Za-z0-9_]{5,32}))?(?: (.+))?', text)
    if not match:
        raise ValueError('invalid_command')
    name, mention, arguments = match.groups()
    if mention and (not isinstance(bot_username, str) or mention.lower() != bot_username.lower()):
        raise ValueError('wrong_bot_mention')
    if name == 'bxreview':
        if arguments is not None:
            raise ValueError('invalid_command')
        return dict(action='review')
    parts = (arguments or '').split(' ')
    if (len(parts) < 2 or not re.fullmatch(r'[0-9a-f]{64}', parts[0]) or
            not re.fullmatch(r'[0-9a-f]{16}', parts[1])):
        raise ValueError('invalid_id_or_version')
    result = dict(review_id=parts[0], version=parts[1], source=None, destination=None)
    if name in ('bxretry', 'bxreject') and len(parts) == 2:
        return dict(result, action=name[2:])
    if name == 'bxconfirm':
        if len(parts) == 5 and parts[2] == 'transfer' and all(re.fullmatch(TOKEN, p) for p in parts[3:]):
            return dict(result, action='transfer', source=parts[3], destination=parts[4])
        if len(parts) == 4 and re.fullmatch(TOKEN, parts[3]):
            if parts[2] == 'expense':
                return dict(result, action='expense', source=parts[3])
            if parts[2] == 'income':
                return dict(result, action='income', destination=parts[3])
    raise ValueError('invalid_command')


def _validate_request(request):
    home = os.environ.get('HERMES_HOME')
    if not isinstance(home, str) or not home or '\x00' in home:
        raise ValueError('trusted_profile_required')
    profile = Path(home)
    if (not profile.is_absolute() or profile.name != PROFILE_NAME or
            profile.parent.name != 'profiles' or not profile.is_dir() or
            not (profile / 'config.yaml').is_file()):
        raise ValueError('trusted_profile_required')
    # Reject aliases into another role (including symlinks) and require the raw
    # plugin request to match the trusted process environment, not chat text.
    resolved = profile.resolve()
    if (resolved.name != PROFILE_NAME or resolved.parent.name != 'profiles' or
            not isinstance(request, dict) or set(request) != REQUEST_FIELDS or
            request.get('profile_home') != home):
        raise ValueError('trusted_profile_required')
    actor = request.get('actor')
    if (not isinstance(actor, dict) or set(actor) != set(ACTOR) or actor != ACTOR or
            actor.get('is_bot') is not False):
        raise ValueError('trusted_private_admin_required')
    mid = request.get('message_id')
    if type(mid) not in (int, str) or not re.fullmatch(r'[1-9][0-9]{0,19}', str(mid)):
        raise ValueError('telegram_message_id_required')
    username = request.get('bot_username')
    if username is not None and (not isinstance(username, str) or not re.fullmatch(r'[A-Za-z0-9_]{5,32}', username)):
        raise ValueError('invalid_bot_username')


def _review_pending(config):
    """Use the queue's scoped reader through an actually read-only connection."""
    store = ReviewStore(config)  # validate config before any file access
    path = Path(config['financial_review_state_path'])
    if not path.exists():
        return dict(ok=True, text='Tidak ada tinjauan pending. /bxreview hanya baca.')
    with closing(sqlite3.connect(path.as_uri() + '?mode=ro', uri=True, timeout=2)) as db:
        db.row_factory = sqlite3.Row
        store.db = db
        records = store.rows(states=['pending'])
    receipt_records = [r for r in records if r['kind'] == 'receipt']
    delivery_records = [r for r in records if r['kind'] == 'delivery']
    lines = ['BudgetX: %d bukti pending, %d pengiriman tertunda (hanya baca).' %
             (len(receipt_records), len(delivery_records))]
    displayed = (receipt_records + delivery_records)[:4]
    for record in displayed:
        base = record['id'] + ' ' + record['version']
        amount = record['parsed'].get('amount')
        amount_text = ('Rp' + format(amount, ',').replace(',', '.')
                       if type(amount) is int and amount > 0 and record['parsed'].get('currency') == 'IDR'
                       else 'nominal/mata uang belum pasti')
        lines.append(base + ' | ' + amount_text)
        if record['kind'] == 'delivery':
            lines.append('Pengiriman tertunda; informasional saja, bukan persetujuan keuangan baru.')
            continue
        # Reuse the queue's pure validation, never decide or mutate during review.
        # Unknown ownership stays a placeholder; known endpoints cannot be remapped.
        commands = []
        wallets = list(config['registry']['wallets'])
        for action in ('transfer', 'expense', 'income'):
            pairs = ([(s, d) for s in wallets for d in wallets] if action == 'transfer' else
                     [(s, None) for s in wallets] if action == 'expense' else [(None, d) for d in wallets])
            for source, destination in pairs:
                try:
                    _endpoints(config, record, action, source, destination)
                except (ValueError, TypeError):
                    continue
                src = source if record['parsed'].get('source_wallet') in wallets else 'SRC'
                dst = destination if record['parsed'].get('destination_wallet') in wallets else 'DEST'
                suffix = action + ' ' + (src + ' ' + dst if action == 'transfer' else src if action == 'expense' else dst)
                command = '/bxconfirm ' + base + ' ' + suffix
                if command not in commands:
                    commands.append(command)
        lines += commands or ['Perlu penilaian manual; fakta uang/status/biaya/parser belum aman.']
        lines += ['/bxretry ' + base, '/bxreject ' + base]
    if len(records) > len(displayed):
        lines.append('%d bukti lain; perintah lengkap juga ada pada notifikasi masing-masing.' % (len(records) - len(displayed)))
    lines += ['SRC/DEST wajib key wallet terdaftar dan sesuai bukti, bukan tebakan. '
              'Fakta tidak aman hanya dapat retry/reject; validasi tetap berlaku. '
              'Konfirmasi hanya bukti/akun ini, bukan alias umum; eksekusi pada proses terjadwal berikutnya.']
    # Native Telegram limits a text message to 4096 chars; response stays bounded.
    return dict(ok=True, text='\n'.join(lines))


def handle_request(config, request):
    _validate_request(request)
    command = parse_command(request['text'], request['bot_username'])
    if command['action'] == 'review':
        return _review_pending(config)
    with ReviewStore(config) as store:
        record = store.decide(**command, actor=request['actor'], message_id=request['message_id'])
    text = ('Penolakan lokal tersimpan; tidak mengizinkan publikasi.' if command['action'] == 'reject' else
            'Persetujuan lokal tersimpan untuk proses terjadwal berikutnya; belum ditulis ke cloud.')
    return dict(ok=True, text=text, id=record['id'], version=record['version'], state=record['state'])


def _unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError('duplicate_json_key')
        result[key] = value
    return result


def main(argv=None):
    import argparse
    import json
    import sys
    from mesh import load_config

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', required=True, help='Absolute private mesh config path')
    args = parser.parse_args(argv)
    try:
        # Read one bounded UTF-8 JSON document, no secrets or raw receipt data.
        raw = sys.stdin.buffer.read(8193)
        if not raw or len(raw) > 8192:
            raise ValueError('invalid_request_size')
        request = json.loads(raw.decode('utf-8'), object_pairs_hook=_unique_object)
        _validate_request(request)
        parse_command(request['text'], request['bot_username'])
        result = handle_request(load_config(args.config), request)
        code = 0
    except Exception:
        # Exception messages can contain labels, paths or provider details. Never echo them.
        result = dict(ok=False, error='review_command_failed',
                      text='Perintah ditolak/gagal. Periksa ID/revisi dan format dari notifikasi atau /bxreview. '
                           'Tidak ada publikasi cloud dari perintah ini; jika respons terputus, periksa status lokal.')
        code = 1
    print(json.dumps(result, ensure_ascii=True, separators=(',', ':')))
    return code


if __name__ == '__main__':
    raise SystemExit(main())
