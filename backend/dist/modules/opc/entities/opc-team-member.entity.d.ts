export declare class OpcTeamMemberEntity {
    id: number;
    teamId: number;
    userId: number;
    role: 'owner' | 'admin' | 'member';
    joinedAt: Date;
}
