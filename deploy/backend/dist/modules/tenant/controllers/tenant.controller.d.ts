import { TenantService } from '../services/tenant.service';
export declare class TenantController {
    private readonly service;
    constructor(service: TenantService);
    health(): {
        status: string;
        module: string;
    };
    listMyTeams(userId: number, page?: string, pageSize?: string): Promise<import("../services/tenant.service").Paginated<import("../../user/entities/team.entity").TeamEntity>>;
    createTeam(userId: number, body: {
        name: string;
        description?: string;
    }): Promise<import("../../user/entities/team.entity").TeamEntity>;
    getTeamDetail(userId: number, teamId: string): Promise<{
        team: import("../../user/entities/team.entity").TeamEntity;
        role: "admin" | "member" | "viewer";
    }>;
    updateTeam(userId: number, teamId: string, body: {
        name?: string;
        description?: string;
    }): Promise<import("../../user/entities/team.entity").TeamEntity>;
    deleteTeam(userId: number, teamId: string): Promise<null>;
    listMembers(userId: number, teamId: string): Promise<import("../../user/entities/team-member.entity").TeamMemberEntity[]>;
    addMember(userId: number, teamId: string, body: {
        userId: number;
        role: 'member' | 'viewer';
    }): Promise<import("../../user/entities/team-member.entity").TeamMemberEntity>;
    removeMember(userId: number, teamId: string, targetUserId: string): Promise<null>;
    updateMemberRole(userId: number, teamId: string, targetUserId: string, body: {
        role: 'member' | 'viewer';
    }): Promise<import("../../user/entities/team-member.entity").TeamMemberEntity>;
}
