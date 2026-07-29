export declare class TeamMemberEntity {
    id: number;
    teamId: number;
    userId: number;
    role: 'admin' | 'member' | 'viewer';
    joinedAt: Date;
}
