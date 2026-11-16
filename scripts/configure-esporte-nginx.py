"""Repair only Esporte virtual hosts; preview by default, --apply to install.

Uses the existing esporte-app certificate. Never manages PM2, Docker, firewall,
other certificates or an entire shared nginx file. Unknown/shared hosts abort.
"""
import argparse
import datetime
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import urllib.request

DOMAINS = {'esporte.testes-techcode.shop', 'api-esporte.testes-techcode.shop'}
TARGET = Path('/etc/nginx/conf.d/esporte-app.conf')
MARKER = '# Managed by scripts/configure-esporte-nginx.py. Only Esporte domains.'


def tokens(source):
    """Token offsets while respecting nginx quotes, escapes and comments."""
    result, index = [], 0
    while index < len(source):
        if source[index].isspace():
            index += 1
            continue
        if source[index] == '#':
            end = source.find('\n', index)
            index = len(source) if end < 0 else end + 1
            continue
        start = index
        if source[index] in '{};':
            index += 1
        else:
            quote = None
            while index < len(source):
                char = source[index]
                if char == '\\':
                    index += 2
                    continue
                if quote:
                    if char == quote:
                        quote = None
                elif char in '\"\'':
                    quote = char
                elif char.isspace() or char in '{};#':
                    break
                index += 1
            if quote:
                raise ValueError('Configuracao com aspas incompletas; nenhuma alteracao aplicada.')
        result.append((source[start:index], start, index))
    return result


def remove_esporte_servers(source):
    parts = tokens(source)
    spans, index = [], 0
    while index < len(parts) - 1:
        if parts[index][0] != 'server' or parts[index + 1][0] != '{':
            index += 1
            continue
        start, depth, names, cursor = parts[index][1], 1, [], index + 2
        while cursor < len(parts) and depth:
            word = parts[cursor][0]
            if depth == 1 and word == 'server_name':
                cursor += 1
                while cursor < len(parts) and parts[cursor][0] != ';':
                    names.append(parts[cursor][0].strip('\"\''))
                    cursor += 1
                if cursor == len(parts):
                    raise ValueError('server_name incompleto.')
            elif word == '{':
                depth += 1
            elif word == '}':
                depth -= 1
            cursor += 1
        if depth:
            raise ValueError('Bloco server incompleto.')
        if DOMAINS.intersection(names):
            if set(names) - DOMAINS:
                raise ValueError('Dominio Esporte compartilha server com outro projeto; recusando alterar.')
            spans.append((start, parts[cursor - 1][2]))
        index = cursor
    for start, end in reversed(spans):
        source = source[:start] + source[end:]
    return source, len(spans)


def run(args):
    completed = subprocess.run(args, capture_output=True, text=True, timeout=45)
    if completed.returncode:
        # No full nginx dump: may contain private routes from another application.
        raise RuntimeError('Falhou: ' + ' '.join(args[:2]) + '. Verifique esse comando na VPS; nada do dump sera exibido.')
    return completed.stdout + completed.stderr


def atomic_write(path, contents):
    previous = path.stat() if path.exists() else None
    descriptor, temporary = tempfile.mkstemp(prefix='.esporte-', dir=path.parent)
    try:
        with os.fdopen(descriptor, 'w', encoding='utf-8', newline='') as handle:
            handle.write(contents)
        os.chmod(temporary, previous.st_mode & 0o777 if previous else 0o644)
        if previous and hasattr(os, 'chown'):
            os.chown(temporary, previous.st_uid, previous.st_gid)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def install_changes(planned, originals, verify, runner=run):
    changed = []
    reloaded = False
    try:
        for path, contents in planned.items():
            atomic_write(path, contents)
            changed.append(path)
        runner(['nginx', '-t'])
        reloaded = True
        runner(['systemctl', 'reload', 'nginx'])
        verify()
    except Exception:
        for path in changed:
            if originals[path] is None:
                path.unlink()
            else:
                atomic_write(path, originals[path])
        runner(['nginx', '-t'])
        if reloaded:
            runner(['systemctl', 'reload', 'nginx'])
        raise RuntimeError('A validacao falhou. Arquivos anteriores restaurados; confira nginx -t e o backup.') from None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true', help='Aplicar apos backup e validar/recarregar Nginx.')
    args = parser.parse_args()
    if os.name != 'posix' or os.geteuid() != 0:
        raise RuntimeError('Execute na VPS Ubuntu com sudo python3 scripts/configure-esporte-nginx.py [--apply].')
    dump = run(['nginx', '-T'])
    template = (Path(__file__).resolve().parent.parent / 'deploy/nginx/esporte-https.conf').read_text(encoding='utf-8')
    if not template.startswith(MARKER):
        raise RuntimeError('Template desconhecido.')
    for name in ['/etc/letsencrypt/live/esporte-app/fullchain.pem', '/etc/letsencrypt/live/esporte-app/privkey.pem', '/etc/letsencrypt/options-ssl-nginx.conf']:
        if not Path(name).is_file():
            raise RuntimeError('Certificado esporte-app ou configuracao SSL ausente. Nao sera alterado outro certificado.')
    if TARGET.is_symlink() or TARGET.parent.resolve() != Path('/etc/nginx/conf.d'):
        raise RuntimeError('Destino inesperado; recusando substituir link.')
    if TARGET.exists() and not TARGET.read_text(encoding='utf-8').startswith(MARKER):
        raise RuntimeError('esporte-app.conf ja existe e nao pertence a este comando; nenhuma alteracao.')
    originals, planned = {}, {}
    for match in re.finditer(r'^# configuration file (/.+):$', dump, re.M):
        path = Path(match[1]).resolve()
        if path == TARGET or not path.is_file() or path in originals:
            continue
        source = path.read_text(encoding='utf-8')
        updated, count = remove_esporte_servers(source)
        if count:
            if not path.is_relative_to(Path('/etc/nginx')):
                raise RuntimeError('Host Esporte fora de /etc/nginx; revisao manual necessaria.')
            originals[path], planned[path] = source, updated
            print(f'{path}: remover somente {count} bloco(s) dos dominios Esporte.')
    originals[TARGET] = TARGET.read_text(encoding='utf-8') if TARGET.exists() else None
    if originals[TARGET] != template:
        planned[TARGET] = template
    if not planned:
        print('Os hosts Esporte ja usam esta configuracao. Nenhuma alteracao.')
        return
    print('Instalar hosts Esporte: API -> 127.0.0.1:3333; painel -> 127.0.0.1:8080; certificado esporte-app existente.')
    if not args.apply:
        print('SIMULACAO: nenhum arquivo alterado. Para aplicar, repita com --apply.')
        return
    with urllib.request.urlopen('http://127.0.0.1:3333/health', timeout=10) as response:
        if json.load(response).get('data', {}).get('service') != 'nacional-api':
            raise RuntimeError('A porta 3333 nao respondeu como Nacional API. Nada alterado.')
    with urllib.request.urlopen('http://127.0.0.1:8080/', timeout=10) as response:
        if response.status != 200:
            raise RuntimeError('Frontend indisponivel na porta 8080. Nada alterado.')
    backup = Path('/var/backups/esporte-nginx') / datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    backup.mkdir(parents=True, mode=0o700)
    manifest = []
    for index, path in enumerate(planned):
        saved = backup / f'{index}.conf'
        if originals[path] is not None:
            shutil.copy2(path, saved)
        manifest.append({'path': str(path), 'backup': str(saved) if originals[path] is not None else None})
    (backup / 'manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    print(f'Backup: {backup}')
    def verify_https():
        output = run(['curl', '--fail', '--silent', '--show-error', '--max-time', '15', '--resolve', 'api-esporte.testes-techcode.shop:443:127.0.0.1', 'https://api-esporte.testes-techcode.shop/health'])
        if json.loads(output).get('data', {}).get('service') != 'nacional-api':
            raise RuntimeError('Validacao HTTPS nao confirmou a API.')
        probe = run(['curl', '--fail', '--silent', '--show-error', '--max-time', '15', '--resolve', 'api-esporte.testes-techcode.shop:443:127.0.0.1', '-H', 'Content-Type: application/json', '--data', '{"probe":true}', 'https://api-esporte.testes-techcode.shop/connection-check'])
        if json.loads(probe).get('data', {}).get('method') != 'POST':
            raise RuntimeError('Validacao HTTPS do envio JSON falhou.')
        run(['curl', '--fail', '--silent', '--show-error', '--max-time', '15', '--output', '/dev/null', '--resolve', 'esporte.testes-techcode.shop:443:127.0.0.1', 'https://esporte.testes-techcode.shop/'])
    install_changes(planned, originals, verify_https)
    print('API confirmada em HTTPS. Hosts Esporte configurados; outros hosts, certificados, Docker e PM2 preservados.')


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        raise SystemExit(f'Nao foi possivel configurar: {error}')
