"""Offline MIME extraction checks, all synthetic; no collector dependency."""
import base64
import importlib
import unittest


def encoded(text, charset='utf-8'):
    return base64.urlsafe_b64encode(text.encode(charset)).decode().rstrip('=')


class Checks(unittest.TestCase):
    def test_recursive_bodies_preserve_labels_and_lines(self):
        h = importlib.import_module('harvest')
        payload = {'mimeType': 'multipart/mixed', 'parts': [
            {'mimeType': 'multipart/alternative', 'parts': [
                {'mimeType': 'text/plain', 'body': {'data': encoded('Bank: Contoh\r\nNominal: Rp 10.000\r\nStatus: Berhasil')}},
                {'mimeType': 'text/html', 'body': {'data': encoded('<style>secret</style><table><tr><td>Nominal:</td><td>Rp 10.000</td></tr><tr><td>Status:</td><td>Berhasil</td></tr></table>')}}]},
            {'mimeType': 'text/plain', 'filename': 'receipt.txt', 'body': {'data': encoded('not body')}},
            {'mimeType': 'text/plain', 'body': {'attachmentId': 'external'}, 'headers': [{'name': 'Content-Type', 'value': 'text/plain; charset=iso-8859-1'}]}
        ]}
        plain, html, normalized, errors = h.extract_bodies(payload, lambda aid: encoded('Café', 'iso-8859-1'))
        self.assertIn('Bank: Contoh\r\nNominal:', plain)
        self.assertIn('Café', plain)
        self.assertNotIn('not body', plain)
        self.assertIn('<table>', html)
        self.assertEqual(normalized, 'Bank: Contoh\nNominal: Rp 10.000\nStatus: Berhasil\n\nCafé')
        self.assertEqual(errors, [])
        _, _, normalized, _ = h.extract_bodies({'mimeType': 'text/html', 'body': {'data': encoded('<p>Bank: Contoh</p><table><tr><td>Nominal:</td><td>10</td></tr><tr><td>Status:</td><td>OK</td></tr></table><script>bad</script>')}}, lambda _: None)
        self.assertIn('Nominal: 10\nStatus: OK', normalized)
        self.assertNotIn('bad', normalized)


if __name__ == '__main__':
    unittest.main()
