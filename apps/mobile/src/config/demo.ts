import original from '@nacional/shared/demo.json';
import { club } from './club';

// Only presentation fixtures change with the selected club. Persisted matches,
// plans, identities and monetary records are never renamed by this adapter.
const demo = {
  ...original,
  member: {
    ...original.member,
    membership: { ...original.member.membership, plan: { ...original.member.membership.plan, name: club.programName } },
  },
  match: { ...original.match, homeTeam: club.upperName },
};
export default demo;
