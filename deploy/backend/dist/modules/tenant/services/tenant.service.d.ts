import { DataSource, Repository } from 'typeorm';
import { TeamEntity } from '../../user/entities/team.entity';
import { TeamMemberEntity } from '../../user/entities/team-member.entity';
type TenantMemberRole = 'admin' | 'member' | 'viewer';
export interface Paginated<T> {
    list: T[];
    total: number;
    page: number;
    pageSize: number;
}
export declare class TenantService {
    private readonly teamRepo;
    private readonly memberRepo;
    private readonly dataSource;
    constructor(teamRepo: Repository<TeamEntity>, memberRepo: Repository<TeamMemberEntity>, dataSource: DataSource);
    health(): {
        status: string;
        module: string;
    };
    listMyTeams(userId: number, page?: number, pageSize?: number): Promise<Paginated<TeamEntity>>;
    createTeam(userId: number, data: {
        name: string;
        description?: string;
    }): Promise<TeamEntity>;
    getTeamDetail(userId: number, teamId: number): Promise<{
        team: TeamEntity;
        role: TenantMemberRole;
    }>;
    updateTeam(userId: number, teamId: number, data: {
        name?: string;
        description?: string;
    }): Promise<TeamEntity>;
    deleteTeam(userId: number, teamId: number): Promise<void>;
    listMembers(userId: number, teamId: number): Promise<TeamMemberEntity[]>;
    addMember(userId: number, teamId: number, targetUserId: number, role: 'member' | 'viewer'): Promise<TeamMemberEntity>;
    removeMember(userId: number, teamId: number, targetUserId: number): Promise<void>;
    updateMemberRole(userId: number, teamId: number, targetUserId: number, role: 'member' | 'viewer'): Promise<TeamMemberEntity>;
    private assertMember;
    private assertAdmin;
    private assertOwner;
}
export {};
