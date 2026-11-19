// Called only by the operator's bootstrap command, inside its transaction.
export async function provisionOwner(tx, { email, name, passwordHash }) {
  const current = await tx.user.findUnique({ where: { email } });
  if (current && (!current.active || !['ADMIN', 'OWNER'].includes(current.role))) {
    throw new Error('Este e-mail já pertence a uma conta inativa ou operacional. Use um e-mail ativo e exclusivo da empresa.');
  }
  if (current?.role === 'OWNER') return current;

  let owner;
  if (current) {
    const at = new Date();
    owner = await tx.user.update({ where: { id: current.id }, data: { role: 'OWNER', name, passwordHash } });
    await tx.session.updateMany({ where: { userId: owner.id, revokedAt: null }, data: { revokedAt: at } });
    await tx.passwordResetToken.updateMany({ where: { userId: owner.id, usedAt: null }, data: { usedAt: at } });
  } else {
    owner = await tx.user.create({ data: { email, name, passwordHash, role: 'OWNER', active: true } });
  }
  await tx.auditLog.create({ data: { actorId: owner.id, entityId: owner.id,
    action: current ? 'PLATFORM_OWNER_PROMOTED' : 'PLATFORM_OWNER_CREATED', details: { source: 'bootstrap' } } });
  return owner;
}
