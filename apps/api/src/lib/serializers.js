export function toMember(user) {
  const membership = user.membership;
  return {
    id: user.id, name: user.name, email: user.email, avatar: user.avatar, points: user.points, role: user.role ?? 'USER', active: user.active ?? true,
    city: user.city, contact: user.contact, preferences: user.preferences, schoolInterested: user.schoolInterested,
    membership: membership ? {
      memberId: membership.memberId,
      status: membership.status === 'ACTIVE' && membership.validUntil <= new Date() ? 'EXPIRED' : membership.status,
      validUntil: membership.validUntil,
      plan: { name: membership.plan.name, discountPercent: membership.plan.discountPercent, priceCents: membership.plan.priceCents },
    } : null,
  };
}
export const isActiveMember = (user, now = new Date()) => user.membership?.status === 'ACTIVE' && user.membership.validUntil > now;
