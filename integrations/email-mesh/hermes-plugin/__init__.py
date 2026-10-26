"""BudgetX receipt commands: native deterministic ingress, never LLM input."""
import asyncio
import json
import logging
import os
import subprocess
from pathlib import Path

logger = logging.getLogger(__name__)


def get_hermes_home():
    # Lazy host API import: discovery by the mesh test interpreter stays harmless.
    # Missing Hermes context is an error, never a default-profile fallback.
    from hermes_constants import get_hermes_home as resolve
    return resolve()


PROFILE_NAME = 'devops-budgetx'
ADMIN_ID = '790484718'
RESERVED = r'^/bx(?:confirm|retry|reject|review)'
REQUEST_FIELDS = {'profile_home', 'actor', 'message_id', 'text', 'bot_username'}
ACTOR = dict(platform='telegram', chat_id=ADMIN_ID, user_id=ADMIN_ID, is_bot=False, chat_type='dm')


def trusted_profile():
    selected = os.environ.get('HERMES_HOME', '')
    path = Path(selected)
    if (not selected or not path.is_absolute() or not path.is_dir() or
            not (path / 'config.yaml').is_file() or path.name != PROFILE_NAME or
            path.parent.name != 'profiles' or path.resolve().name != PROFILE_NAME or
            path.resolve().parent.name != 'profiles'):
        raise ValueError('explicit_existing_devops_profile_required')
    return path.resolve()


def runtime_paths():
    """Service-owned settings only; incoming requests cannot choose executable paths."""
    profile = trusted_profile()
    root = Path(os.environ.get('BUDGETX_MESH_ROOT', ''))
    config = Path(os.environ.get('BUDGETX_MESH_CONFIG', ''))
    python = Path(os.environ.get('BUDGETX_MESH_PYTHON', ''))
    if (not root.is_absolute() or not root.is_dir() or not config.is_absolute() or not config.is_file() or
            not python.is_absolute() or not python.is_file() or not os.access(python, os.X_OK)):
        raise ValueError('explicit_existing_mesh_paths_required')
    root = root.resolve()
    backend = root / 'financial_review_admin.py'
    if not backend.is_file():
        raise ValueError('backend_missing')
    return profile, str(root), str(python), str(backend), str(config)


def run_backend(payload):
    """Fixed trusted executable/config; never interpolate chat text in argv/shell."""
    profile, root, python, backend, config = runtime_paths()
    raw = json.dumps(payload, ensure_ascii=True, separators=(',', ':')).encode('utf-8')
    if (not isinstance(payload, dict) or set(payload) != REQUEST_FIELDS or
            payload.get('profile_home') != str(profile) or payload.get('actor') != ACTOR or
            payload['actor'].get('is_bot') is not False or
            not isinstance(payload.get('message_id'), str) or not payload['message_id'].isascii() or
            not payload['message_id'].isdigit() or not 0 < int(payload['message_id']) < 10**20 or
            not isinstance(payload.get('bot_username'), str) or not 0 < len(payload['bot_username']) <= 64 or
            not isinstance(payload.get('text'), str) or not 0 < len(payload['text']) <= 2048 or len(raw) > 8192):
        raise ValueError('invalid_request_size_or_profile')
    completed = subprocess.run([python, backend, '--config', config], input=raw,
                               stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                               timeout=8, shell=False, check=False, cwd=root,
                               env={'HERMES_HOME': str(profile), 'PATH': '/usr/bin:/bin',
                                    'LANG': 'C.UTF-8', 'PYTHONDONTWRITEBYTECODE': '1'})
    if completed.returncode not in (0, 1) or len(completed.stdout) > 16384:
        raise RuntimeError('backend_unavailable')
    result = json.loads(completed.stdout.decode('utf-8'))
    if (not isinstance(result, dict) or type(result.get('ok')) is not bool or
            result['ok'] != (completed.returncode == 0) or
            not isinstance(result.get('text'), str) or not 0 < len(result['text']) <= 3900):
        raise ValueError('invalid_backend_response')
    return result


def _adapter_profile(adapter):
    return (getattr(adapter, '_hermes_profile_name', None), getattr(adapter, '_owner_profile', None))


def _native_message(update):
    from telegram import Update
    if not isinstance(update, Update):
        return None
    message = update.message
    if message is None or update.effective_message is not message:
        return None
    if any(getattr(update, key, None) is not None for key in (
            'edited_message', 'channel_post', 'edited_channel_post', 'business_message', 'edited_business_message')):
        return None
    if (message.from_user is None or type(message.from_user.id) is not int or message.from_user.id != 790484718 or
            message.from_user.is_bot is not False or message.chat.type != 'private' or
            type(message.chat.id) is not int or message.chat.id != 790484718 or
            type(message.message_id) is not int or not 0 < message.message_id < 10**20):
        return None
    if any(getattr(message, key, None) for key in (
            'edit_date', 'sender_chat', 'forward_origin', 'forward_from', 'forward_from_chat',
            'forward_date', 'forward_sender_name', 'is_automatic_forward', 'via_bot',
            'sender_business_bot', 'business_connection_id')):
        return None
    if any(key.startswith('forward_') for key in message.api_kwargs):
        return None
    if not isinstance(message.text, str) or not 0 < len(message.text) <= 2048:
        return None
    return message


def register(ctx):
    # get_hermes_home is context-local under the shared gateway multiplexer.
    profile_home = trusted_profile()
    registration_home = Path(get_hermes_home()).resolve()

    def factory(native, adapter):
        from telegram.ext import ApplicationHandlerStop, MessageHandler, filters
        factory_home = Path(get_hermes_home()).resolve()
        owner = _adapter_profile(adapter)
        scope_ok = (registration_home == profile_home and factory_home == profile_home and
                    all(value in (None, 'devops-budgetx') for value in owner))

        async def command(update, context):
            try:
                # Environment selects an installation, not an actor: require the
                # context-local home, adapter owner and native Update together.
                if (not scope_ok or Path(get_hermes_home()).resolve() != profile_home or
                        trusted_profile() != profile_home or
                        _adapter_profile(adapter) != owner):
                    return
                message = _native_message(update)
                if message is None:
                    return
                payload = dict(profile_home=str(profile_home),
                               actor=dict(platform='telegram', chat_id=str(message.chat.id),
                                          user_id=str(message.from_user.id), is_bot=False, chat_type='dm'),
                               message_id=str(message.message_id), text=message.text,
                               bot_username=context.bot.username)
                try:
                    # Synchronous and bounded: persist local intent before any await.
                    result = run_backend(payload)
                    text = result['text']
                except Exception:
                    text = ('Perintah gagal atau status lokal belum pasti. Periksa /bxreview sebelum mengulang. '
                            'Tidak ada publikasi cloud langsung dari perintah ini.')
                try:
                    await asyncio.wait_for(context.bot.send_message(
                        chat_id=message.chat.id, text=text, parse_mode=None,
                        read_timeout=4, write_timeout=4, connect_timeout=4, pool_timeout=4), timeout=5)
                except Exception:
                    pass  # Durable local intent is not undone by a failed acknowledgement.
            finally:
                # PTB first-match only stops one group. This stops EVERY later group,
                # including busy-session queuing, core slash dispatch and LLM fallback.
                raise ApplicationHandlerStop

        native.add_handler(MessageHandler(filters.Regex(RESERVED), command, block=True), group=-10000)
        if scope_ok:
            logger.info('BudgetX receipt review Telegram handler installed profile=devops-budgetx pid=%d', os.getpid())

    ctx.register_telegram_handler(factory)
