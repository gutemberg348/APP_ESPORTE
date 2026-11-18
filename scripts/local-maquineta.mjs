import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { copyFile, mkdir, readFile, readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, parseEnv } from 'node:util';
import { prepareSigning, resolveBuildSettings, verifyAndroidApk } from './local-app.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const project = join(root, 'apps/maquineta');
const packageId = 'br.com.esporte.bilheteria.smart';
const require = createRequire(import.meta.url);
const { values } = parseArgs({ options: { check: { type: 'boolean' }, plan: { type: 'boolean' } } });
const sources = [];
for (const name of ['.env.production.example', '.env.production', '.env.android.local']) {
  try { sources.push(parseEnv(await readFile(join(root, 'apps/mobile', name), 'utf8'))); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
const { settings, publicEnv } = resolveBuildSettings([...sources, process.env], JSON.parse(await readFile(join(root, 'packages/shared/brands.json'), 'utf8')));
const destination = join(root, 'dist/android/bilheteria-moderninha-release.apk');
console.log('Moderninha Smart · ' + packageId + '\nAPI ' + publicEnv.EXPO_PUBLIC_API_URL + '\n' + destination);
if (values.plan) process.exit(0);
const sdk = settings.ANDROID_SDK_ROOT || settings.ANDROID_HOME || (process.platform === 'win32' ? join(process.env.LOCALAPPDATA, 'Android/Sdk') : join(homedir(), process.platform === 'darwin' ? 'Library/Android/sdk' : 'Android/Sdk'));
const jdk = settings.ANDROID_JAVA_HOME || process.env.JAVA_HOME;
const binary = name => jdk ? join(jdk, 'bin', name + (process.platform === 'win32' ? '.exe' : '')) : name;
const env = { ...process.env, ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk, ...(jdk && { JAVA_HOME: jdk }) };
function run(cmd, args, childEnv = env) {
  const result = spawnSync(cmd, args, { env: childEnv, cwd: project, stdio: 'inherit', windowsHide: true });
  if (result.error || result.status !== 0) throw new Error('Ferramenta Android falhou: ' + (result.error?.message || result.status));
}
if (!values.check) {
  // This app owns its signing identity; the mobile keystore never becomes the default.
  const signature = await prepareSigning({ directory: join(root, '.secrets/android', packageId), settings: {}, packageId,
    generate: async k => run(binary('keytool'), ['-genkeypair','-noprompt','-storetype','PKCS12','-keystore',k.storeFile,'-alias',k.keyAlias,'-keyalg','RSA','-keysize','3072','-validity','10000','-dname','CN=Bilheteria Esporte','-storepass:env','TERMINAL_STORE_PASSWORD','-keypass:env','TERMINAL_STORE_PASSWORD'], { ...env, TERMINAL_STORE_PASSWORD: k.storePassword }) });
  Object.assign(env, { TERMINAL_STORE_FILE: signature.storeFile, TERMINAL_STORE_PASSWORD: signature.storePassword, TERMINAL_KEY_ALIAS: signature.keyAlias, TERMINAL_KEY_PASSWORD: signature.keyPassword });
}
const wrapper = join(dirname(require.resolve('@react-native/gradle-plugin/package.json')), 'gradle/wrapper/gradle-wrapper.jar');
const tasks = values.check ? ['compileReleaseJavaWithJavac', 'processReleaseResources', 'mergeExtDexRelease'] : ['assembleRelease'];
run(binary('java'), ['-classpath', wrapper, 'org.gradle.wrapper.GradleWrapperMain', '--console=plain', '-PterminalApiUrl=' + publicEnv.EXPO_PUBLIC_API_URL, ...tasks]);
if (!values.check) {
  const output = join(project, 'build/outputs/apk/release');
  const metadata = JSON.parse(await readFile(join(output, 'output-metadata.json'), 'utf8'));
  if (metadata.applicationId !== packageId || metadata.elements.length !== 1) throw new Error('APK da maquineta não identificado.');
  const apk = resolve(output, metadata.elements[0].outputFile);
  const versions = (await readdir(join(sdk, 'build-tools'))).filter(v => /^\d+\.\d+\.\d+$/.test(v)).sort((a,b) => b.localeCompare(a, 'en', { numeric: true }));
  await verifyAndroidApk({ artifact: apk, buildTools: join(sdk, 'build-tools', versions[0]), java: binary('java'), env });
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(apk, destination);
  console.log('APK assinado disponível em ' + destination);
}
