const base = require('./app.json');
const brands = require('../../packages/shared/brands.json');

module.exports = () => {
  const id = process.env.EXPO_PUBLIC_CLUB || 'esporte';
  const club = brands[id];
  if (!club) throw new Error(`Clube não configurado: ${id}`);
  return {
    ...base.expo,
    name: club.appName,
    // Preserve bundle/package IDs and deep-link schemes for existing installs.
    plugins: base.expo.plugins.map((plugin) => Array.isArray(plugin) && plugin[0] === 'expo-camera'
      ? [plugin[0], { ...plugin[1], cameraPermission: `Permitir que o app do ${club.name} leia QRs de ingressos e vendas.` }]
      : plugin),
    extra: { ...base.expo.extra, clubId: id },
  };
};
