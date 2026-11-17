// Only a new account can be attributed. No rewards or financial credits are issued here.
export async function invitationOwner(tx, code) {
  if (!code) return undefined;
  const owner = await tx.user.findUnique({ where: { referralCode: code }, select: { id: true, role: true, active: true } });
  return owner?.active && owner.role === 'USER' ? owner.id : undefined;
}
