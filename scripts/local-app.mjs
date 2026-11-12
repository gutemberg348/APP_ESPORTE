import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { copyFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, parseEnv } from 'node:util';

const root = fileURLToPath(new URL('../', import.meta.url));
const mobile = join(root, 'apps/mobile');
const require = createRequire(new URL('../apps/mobile/package.json', import.meta.url));
const publicNames = ['EXPO_PUBLIC_API_URL', 'EXPO_PUBLIC_CLUB', 'EXPO_PUBLIC_TENANT_SLUG'];
const privateNames = ['ANDROID_JAVA_HOME', 'ANDROID_SDK_ROOT', 'ANDROID_HOME', 'ANDROID_KEYSTORE_PATH', 'ANDROID_KEYSTORE_PASSWORD', 'ANDROID_KEY_ALIAS', 'ANDROID_KEY_PASSWORD'];

async function optionalEnv(path) {
  try { return parseEnv(await readFile(path, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
}
async function exists(path) {
  try { await stat(path); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}
export function resolveBuildSettings(sources, brands) {
  const settings = {};
  for (const source of sources) for (const name of [...publicNames, ...privateNames]) {
    if (typeof source[name] === 'string' && source[name].trim()) settings[name] = name.endsWith('_PASSWORD') ? source[name] : source[name].trim();
  }
  let api;
  try { api = new URL(settings.EXPO_PUBLIC_API_URL); } catch { throw new Error('Configure EXPO_PUBLIC_API_URL com a URL HTTPS pública da API, terminando em /v1.'); }
  if (api.protocol !== 'https:' || api.username || api.password || api.search || api.hash || ['localhost', '127.0.0.1', '[::1]'].includes(api.hostname) || !api.pathname.replace(/\/$/, '').endsWith('/v1')) {
    throw new Error('O APK requer uma API HTTPS acessível pelo celular, terminando em /v1 e sem credenciais, query ou fragmento.');
  }
  const club = settings.EXPO_PUBLIC_CLUB || 'esporte';
  if (!Object.hasOwn(brands, club)) throw new Error('EXPO_PUBLIC_CLUB não corresponde a um clube configurado.');
  const tenant = settings.EXPO_PUBLIC_TENANT_SLUG || 'nacional-patos';
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(tenant)) throw new Error('EXPO_PUBLIC_TENANT_SLUG inválido.');
  const signing = ['ANDROID_KEYSTORE_PATH', 'ANDROID_KEYSTORE_PASSWORD', 'ANDROID_KEY_ALIAS', 'ANDROID_KEY_PASSWORD'];
  if (signing.some(name => settings[name]) && !signing.every(name => settings[name])) throw new Error('Para usar uma chave existente, preencha os quatro campos ANDROID_KEYSTORE_PATH/PASSWORD, ANDROID_KEY_ALIAS e ANDROID_KEY_PASSWORD.');
  return { settings, publicEnv: { EXPO_PUBLIC_API_URL: api.toString().replace(/\/$/, ''), EXPO_PUBLIC_CLUB: club, EXPO_PUBLIC_TENANT_SLUG: tenant, EXPO_PUBLIC_API_HOST_MODE: 'configured', EXPO_PUBLIC_DEMO_MODE: 'false' }, club };
}
export function buildChildEnv(environment, publicEnv) {
  const clean = Object.fromEntries(Object.entries(environment).filter(([key]) => !key.startsWith('EXPO_PUBLIC_')));
  return { ...clean, ...publicEnv, NODE_ENV: 'production', EXPO_NO_DOTENV: '1', EXPO_NO_TELEMETRY: '1', CI: '1' };
}
function run(command, args, { env, cwd = mobile, capture = false } = {}) {
  const result = spawnSync(command, args, { cwd, env, stdio: capture ? 'pipe' : 'inherit', encoding: 'utf8', windowsHide: true });
  if (result.error) throw new Error(`Não foi possível executar ${command}: ${result.error.code || 'falha ao iniciar'}.`);
  if (result.status !== 0) throw new Error(`A etapa ${command.endsWith('keytool.exe') || command === 'keytool' ? 'assinatura Android' : 'de build'} falhou (saída ${result.status ?? result.signal}). Confira a saída acima; nenhum APK antigo será apresentado como novo.`);
  return `${result.stdout || ''}\n${result.stderr || ''}`;
}
export function parseRequirements(toml) {
  const value = (name) => {
    const match = toml.match(new RegExp(`^${name}\\s*=\\s*"([^"]+)"`, 'm'));
    if (!match) throw new Error(`Requisito Android ausente no React Native instalado: ${name}.`);
    return match[1];
  };
  return { compileSdk: value('compileSdk'), buildTools: value('buildTools'), ndk: value('ndkVersion') };
}
async function toolchain(settings, env, requirements) {
  const sdk = settings.ANDROID_SDK_ROOT || settings.ANDROID_HOME || (process.platform === 'win32' && process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Android/Sdk') : process.platform === 'darwin' ? join(homedir(), 'Library/Android/sdk') : join(homedir(), 'Android/Sdk'));
  if (!await exists(sdk)) throw new Error('Android SDK não encontrado. Configure ANDROID_SDK_ROOT ou ANDROID_HOME.');
  const studioJdk = process.platform === 'win32' ? join(process.env.ProgramFiles || 'C:/Program Files', 'Android/Android Studio/jbr') : '';
  const jdk = settings.ANDROID_JAVA_HOME || process.env.JAVA_HOME || (studioJdk && await exists(studioJdk) ? studioJdk : '');
  const executable = (name) => jdk ? join(jdk, 'bin', `${name}${process.platform === 'win32' ? '.exe' : ''}`) : name;
  const child = { ...env, ...(jdk ? { JAVA_HOME: jdk } : {}), ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk };
  const java = run(executable('java'), ['-version'], { env: child, capture: true });
  const major = Number(java.match(/version\s+"(?:1\.)?(\d+)/)?.[1]);
  if (!major || major < 17) throw new Error('Este projeto requer JDK 17 ou superior. Configure JAVA_HOME ou ANDROID_JAVA_HOME.');
  const platforms = await readdir(join(sdk, 'platforms'), { withFileTypes: true });
  let platformFound = false;
  for (const entry of platforms.filter(entry => entry.isDirectory())) {
    try {
      const props = await readFile(join(sdk, 'platforms', entry.name, 'source.properties'), 'utf8');
      if (Number(props.match(/^AndroidVersion.ApiLevel=(.+)$/m)?.[1]) === Number(requirements.compileSdk)) platformFound = true;
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const missing = [!platformFound && `Android SDK Platform ${requirements.compileSdk}`, !await exists(join(sdk, 'build-tools', requirements.buildTools)) && `Build Tools ${requirements.buildTools}`, !await exists(join(sdk, 'ndk', requirements.ndk)) && `NDK ${requirements.ndk}`].filter(Boolean);
  if (missing.length) throw new Error(`Instale pelo SDK Manager do Android Studio: ${missing.join(', ')}. Aceite as licenças antes de gerar novamente.`);
  console.log(`Ferramentas disponíveis: Java ${major}, SDK ${requirements.compileSdk}, Build Tools ${requirements.buildTools}, NDK ${requirements.ndk}.`);
  return { env: child, sdk, executable };
}
export async function prepareSigning({ directory, settings, packageId, generate }) {
  if (settings.ANDROID_KEYSTORE_PATH) {
    const storeFile = resolve(root, settings.ANDROID_KEYSTORE_PATH);
    if (!await exists(storeFile)) throw new Error('O arquivo ANDROID_KEYSTORE_PATH não foi encontrado.');
    return { storeFile, storePassword: settings.ANDROID_KEYSTORE_PASSWORD, keyAlias: settings.ANDROID_KEY_ALIAS, keyPassword: settings.ANDROID_KEY_PASSWORD };
  }
  const storeFile = join(directory, 'release.p12'), credentialsFile = join(directory, 'credentials.json');
  const hasStore = await exists(storeFile), hasCredentials = await exists(credentialsFile);
  if (hasStore !== hasCredentials) throw new Error(`Assinatura local incompleta em ${directory}. Restaure a chave e suas credenciais; o script não substituirá a identidade de um app instalado.`);
  if (hasCredentials) {
    const saved = JSON.parse(await readFile(credentialsFile, 'utf8'));
    if (saved.packageId !== packageId || !['storePassword', 'keyAlias', 'keyPassword'].every(key => typeof saved[key] === 'string' && saved[key])) throw new Error('Credenciais da assinatura Android inválidas ou de outro aplicativo.');
    return { storeFile, storePassword: saved.storePassword, keyAlias: saved.keyAlias, keyPassword: saved.keyPassword };
  }
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const password = randomBytes(32).toString('hex');
  const credentials = { packageId, storePassword: password, keyAlias: 'local-release', keyPassword: password };
  await writeFile(credentialsFile, JSON.stringify(credentials, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  await generate({ storeFile, ...credentials });
  if (!await exists(storeFile)) throw new Error('O keytool não criou a chave local. Confira a configuração do Java.');
  console.log('Chave Android criada em .secrets/android. Guarde uma cópia privada desta pasta para atualizar o app no futuro.');
  return { storeFile, storePassword: password, keyAlias: credentials.keyAlias, keyPassword: password };
}

async function main() {
  const { values } = parseArgs({ options: { help: { type: 'boolean' }, plan: { type: 'boolean' }, check: { type: 'boolean' }, aab: { type: 'boolean' } } });
  if (values.help) { console.log('npm run local:app [-- --check | --plan | --aab]\nPadrão: APK Android release local, assinado e com JavaScript incluído.\n--check: confere as ferramentas, sem prebuild, chave ou compilação.\n--plan: mostra as etapas, sem executar ferramentas.\n--aab: gera um Android App Bundle usando a mesma assinatura.'); return; }
  if (values.plan && values.check) throw new Error('Use apenas --plan ou --check.');
  const brands = JSON.parse(await readFile(join(root, 'packages/shared/brands.json'), 'utf8'));
  // Never load the root/server .env, nor the mobile development .env.
  const config = resolveBuildSettings([await optionalEnv(join(mobile, '.env.production.example')), await optionalEnv(join(mobile, '.env.production')), await optionalEnv(join(mobile, '.env.android.local')), process.env], brands);
  const pkg = JSON.parse(await readFile(join(mobile, 'package.json'), 'utf8'));
  const app = JSON.parse(await readFile(join(mobile, 'app.json'), 'utf8')).expo;
  const env = buildChildEnv(process.env, config.publicEnv);
  const extension = values.aab ? 'aab' : 'apk';
  const filename = `${brands[config.club].appName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-release.${extension}`;
  const destination = join(root, 'dist/android', filename);
  const rnRoot = dirname(require.resolve('react-native/package.json'));
  const requirements = parseRequirements(await readFile(join(rnRoot, 'gradle/libs.versions.toml'), 'utf8'));
  console.log(`App: ${brands[config.club].appName}\nAPI: ${config.publicEnv.EXPO_PUBLIC_API_URL}\nSaída: ${destination}`);
  if (values.plan) { console.log(`1. Conferir JDK/SDK/NDK.\n2. Preparar/reutilizar assinatura privada local.\n3. Gerar/atualizar apps/mobile/android com prebuild local, sem apagar a pasta.\n4. Gradle :app:${values.aab ? 'bundleRelease' : 'assembleRelease'}, sem iniciar Metro ou instalar no aparelho.\n5. ${values.aab ? 'Copiar AAB assinado' : 'Verificar assinatura e copiar APK'} para dist/android.\nNenhuma etapa de geração foi executada.`); return; }
  const tools = await toolchain(config.settings, env, requirements);
  if (values.check) { console.log('Verificação concluída. Nenhuma chave, projeto nativo ou APK foi gerado.'); return; }
  const signing = await prepareSigning({ directory: join(root, '.secrets/android', app.android.package), settings: config.settings, packageId: app.android.package,
    generate: async (key) => run(tools.executable('keytool'), ['-genkeypair', '-noprompt', '-storetype', 'PKCS12', '-keystore', key.storeFile, '-alias', key.keyAlias, '-keyalg', 'RSA', '-keysize', '3072', '-validity', '10000', '-dname', 'CN=Socio Esporte Local, OU=Mobile, O=Esporte, C=BR', '-storepass:env', 'LOCAL_APP_STORE_PASSWORD', '-keypass:env', 'LOCAL_APP_KEY_PASSWORD'], { env: { ...tools.env, LOCAL_APP_STORE_PASSWORD: key.storePassword, LOCAL_APP_KEY_PASSWORD: key.keyPassword } }) });
  const signedEnv = { ...tools.env, LOCAL_APP_STORE_PASSWORD: signing.storePassword };
  run(tools.executable('keytool'), ['-list', '-keystore', signing.storeFile, '-alias', signing.keyAlias, '-storepass:env', 'LOCAL_APP_STORE_PASSWORD'], { env: signedEnv });
  const expoCli = require.resolve('expo/bin/cli');
  const template = join(dirname(require.resolve('expo/package.json')), 'template.tgz');
  run(process.execPath, [expoCli, 'prebuild', '--platform', 'android', '--no-install', '--no-clean', '--template', template, '--skip-dependency-update', Object.keys(pkg.dependencies).join(',')], { env: tools.env });
  const native = join(mobile, 'android');
  const gradleEnv = { ...tools.env, ORG_GRADLE_PROJECT_localAppStoreFile: signing.storeFile, ORG_GRADLE_PROJECT_localAppStorePassword: signing.storePassword, ORG_GRADLE_PROJECT_localAppKeyAlias: signing.keyAlias, ORG_GRADLE_PROJECT_localAppKeyPassword: signing.keyPassword };
  const task = values.aab ? ':app:bundleRelease' : ':app:assembleRelease';
  const gradleArgs = [task, '--no-daemon', '--no-configuration-cache', '--console=plain', '--init-script', '../../../scripts/android-local.init.gradle'];
  if (process.platform === 'win32') run(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `gradlew.bat ${gradleArgs.join(' ')}`], { cwd: native, env: gradleEnv });
  else run('sh', ['./gradlew', ...gradleArgs], { cwd: native, env: gradleEnv });
  const artifact = join(native, 'app/build/outputs', values.aab ? 'bundle/release/app-release.aab' : 'apk/release/app-release.apk');
  if (!await exists(artifact)) throw new Error('O Gradle terminou sem o arquivo release assinado esperado. Confira os outputs da compilação.');
  if (!values.aab) {
    const verifyEnv = { ...tools.env, LOCAL_APP_APK: artifact };
    const buildTools = join(tools.sdk, 'build-tools', requirements.buildTools);
    if (process.platform === 'win32') run(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'apksigner.bat verify --verbose --print-certs "%LOCAL_APP_APK%"'], { cwd: buildTools, env: verifyEnv });
    else run(join(buildTools, 'apksigner'), ['verify', '--verbose', '--print-certs', artifact], { env: verifyEnv });
  }
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(artifact, destination);
  const sha256 = createHash('sha256').update(await readFile(destination)).digest('hex');
  await writeFile(`${destination}.json`, JSON.stringify({ file: filename, appName: brands[config.club].appName, packageId: app.android.package, version: app.version, apiUrl: config.publicEnv.EXPO_PUBLIC_API_URL, club: config.club, tenantSlug: config.publicEnv.EXPO_PUBLIC_TENANT_SLUG, sha256, createdAt: new Date().toISOString() }, null, 2) + '\n');
  console.log(`\nArquivo gerado: ${destination}\nSHA-256: ${sha256}\nO app inclui o JavaScript e acessa diretamente a API HTTPS configurada.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(`\nNão foi possível gerar o app: ${error.message}`); process.exitCode = 1; });
