import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('esporte_nginx', Path(__file__).with_name('configure-esporte-nginx.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class EsporteNginxTests(unittest.TestCase):
    def test_preserves_other_hosts_and_only_removes_exclusive_esporte_blocks(self):
        other = '''# Existing project, do not edit
server {
  listen 443 ssl;
  server_name escala.testes-techcode.shop escala-api.testes-techcode.shop;
  ssl_certificate /etc/letsencrypt/live/escala.testes-techcode.shop/fullchain.pem;
  location / { proxy_pass http://127.0.0.1:3000; }
}
server { listen 80 default_server; server_name _; root /var/www/html; }
'''
        esporte = '''server {
    server_name api-esporte.testes-techcode.shop esporte.testes-techcode.shop;
    listen 443 ssl;
    # A brace in a comment is not a block: }
    set $text "a } brace and # quote";
    location / { try_files $uri $uri/ =404; }
}
server { listen 80; server_name esporte.testes-techcode.shop api-esporte.testes-techcode.shop; return 404; }'''
        result, count = module.remove_esporte_servers(other + esporte)
        self.assertEqual(count, 2)
        self.assertEqual(result, other + '\n')
        self.assertEqual(module.remove_esporte_servers(result), (result, 0))

    def test_shared_host_is_rejected_without_mutation(self):
        for extra in ['escala.testes-techcode.shop', '_', '*.testes-techcode.shop']:
            with self.assertRaisesRegex(ValueError, 'compartilha'):
                module.remove_esporte_servers(f'server {{ server_name esporte.testes-techcode.shop {extra}; }}')

    def test_invalid_or_incomplete_config_rejected(self):
        for source in ['server { server_name esporte.testes-techcode.shop;', 'server { server_name "unterminated;', 'server { server_name esporte.testes-techcode.shop']:
            with self.assertRaises(ValueError):
                module.remove_esporte_servers(source)

    def test_non_target_servers_and_comments_are_identical(self):
        source = '# server { server_name esporte.testes-techcode.shop; }\nserver { server_name other.test; set $value "server {"; }'
        self.assertEqual(module.remove_esporte_servers(source), (source, 0))

    def test_validation_failure_restores_files_without_reload(self):
        with tempfile.TemporaryDirectory(prefix='esporte-nginx-test-') as folder:
            existing, new = Path(folder) / 'default', Path(folder) / 'esporte.conf'
            existing.write_text('original shared file')
            calls = []
            def runner(args):
                calls.append(args)
                if len(calls) == 1:
                    raise RuntimeError('nginx -t failed')
            with self.assertRaisesRegex(RuntimeError, 'restaurados'):
                module.install_changes({existing: 'replacement', new: 'new'}, {existing: 'original shared file', new: None}, lambda: self.fail('must not verify invalid config'), runner)
            self.assertEqual(existing.read_text(), 'original shared file')
            self.assertFalse(new.exists())
            self.assertFalse(any('reload' in call for call in calls))

    def test_post_reload_failure_restores_previous_config_and_reloads(self):
        with tempfile.TemporaryDirectory(prefix='esporte-nginx-test-') as folder:
            file = Path(folder) / 'default'
            file.write_text('before')
            calls = []
            def fail():
                raise RuntimeError('API identity did not match')
            with self.assertRaises(RuntimeError):
                module.install_changes({file: 'after'}, {file: 'before'}, fail, lambda args: calls.append(args))
            self.assertEqual(file.read_text(), 'before')
            self.assertEqual(calls, [['nginx', '-t'], ['systemctl', 'reload', 'nginx'], ['nginx', '-t'], ['systemctl', 'reload', 'nginx']])

    def test_success_installs_only_selected_file_and_validates_before_reload(self):
        with tempfile.TemporaryDirectory(prefix='esporte-nginx-test-') as folder:
            file, other = Path(folder) / 'esporte.conf', Path(folder) / 'escala.conf'
            other.write_bytes(b'other project untouched')
            calls = []
            module.install_changes({file: 'new'}, {file: None}, lambda: calls.append(['verified']), lambda args: calls.append(args))
            self.assertEqual(other.read_bytes(), b'other project untouched')
            self.assertEqual(file.read_text(), 'new')
            self.assertEqual(calls, [['nginx', '-t'], ['systemctl', 'reload', 'nginx'], ['verified']])


if __name__ == '__main__':
    unittest.main()
