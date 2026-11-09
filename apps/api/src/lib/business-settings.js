// Defaults initialize a persisted configuration. Runtime rules always read the database.
export const readBusinessSettings = (client) => client.businessSettings.upsert({
  where: { id: 'main' }, create: { id: 'main' }, update: {},
});
