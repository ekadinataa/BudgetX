"""Recursive Gmail MIME extraction. No network/LLM calls here."""
import base64
import re
import unicodedata
from email.message import Message
from html.parser import HTMLParser


class HTMLText(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.chunks = []
        self.hidden = 0

    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style'):
            self.hidden += 1
        elif not self.hidden:
            if tag in ('br', 'p', 'div', 'li', 'h1', 'h2', 'h3', 'hr', 'pre'):
                self.chunks.append('\n')
            elif tag in ('td', 'th'):
                self.chunks.append(' ')

    def handle_endtag(self, tag):
        if tag in ('script', 'style'):
            self.hidden = max(0, self.hidden - 1)
        elif not self.hidden and tag in ('p', 'div', 'tr', 'li', 'h1', 'h2', 'h3', 'pre'):
            self.chunks.append('\n')

    def handle_data(self, data):
        if not self.hidden:
            self.chunks.append(data)


def normalize(text):
    text = unicodedata.normalize('NFC', text).replace('\r\n', '\n').replace('\r', '\n')
    text = text.replace('\u00a0', ' ').replace('\u200b', '')
    lines = [re.sub(r'[^\S\n]+', ' ', line).strip() for line in text.split('\n')]
    return re.sub(r'\n{3,}', '\n\n', '\n'.join(lines)).strip()


def extract_bodies(payload, fetch_attachment):
    plain, html, errors = [], [], []

    def visit(part, path='0'):
        headers = Message()
        for header in part.get('headers', []):
            headers[header['name']] = header['value']
        # ponytail: attachment files are not bodies; add OCR/PDF parsing separately.
        if part.get('filename') or headers.get_content_disposition() == 'attachment':
            return
        mime = part.get('mimeType', '').lower()
        if mime in ('text/plain', 'text/html'):
            try:
                body = part.get('body', {})
                data = body.get('data')
                if data is None and body.get('attachmentId'):
                    data = fetch_attachment(body['attachmentId'])
                if data is not None:
                    raw = base64.b64decode(data + '=' * (-len(data) % 4), altchars=b'-_', validate=True)
                    charset = headers.get_content_charset() or 'utf-8'
                    try:
                        text = raw.decode(charset)
                    except (LookupError, UnicodeDecodeError):
                        text = raw.decode('utf-8', errors='replace')
                        errors.append({'part': path, 'error': 'charset_decode_fallback', 'charset': charset})
                    (plain if mime == 'text/plain' else html).append(text)
            except Exception as exc:
                errors.append({'part': path, 'error': type(exc).__name__})
        for index, child in enumerate(part.get('parts', [])):
            visit(child, f'{path}.{index}')

    visit(payload)
    plain_text, html_text = '\n\n'.join(plain), '\n\n'.join(html)
    if plain_text.strip():
        normalized = normalize(plain_text)
    else:
        parser = HTMLText()
        parser.feed(html_text)
        normalized = normalize(''.join(parser.chunks))
    return plain_text, html_text, normalized, errors
