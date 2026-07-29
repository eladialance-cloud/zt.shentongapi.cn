import { OpcService } from '../services/opc.service';
export declare class OpcController {
    private readonly service;
    constructor(service: OpcService);
    health(): {
        status: string;
        module: string;
    };
    listTeams(userId: number, page?: string, pageSize?: string): Promise<import("../services/opc.service").Paginated<import("../entities/opc-team.entity").OpcTeamEntity>>;
    createTeam(userId: number, body: {
        name: string;
        description?: string;
        avatar?: string;
    }): Promise<import("../entities/opc-team.entity").OpcTeamEntity>;
    getTeamDetail(userId: number, teamId: string): Promise<{
        team: import("../entities/opc-team.entity").OpcTeamEntity;
        role: "admin" | "member" | "owner";
    }>;
    updateTeam(userId: number, teamId: string, body: {
        name?: string;
        description?: string;
        avatar?: string;
    }): Promise<import("../entities/opc-team.entity").OpcTeamEntity>;
    deleteTeam(userId: number, teamId: string): Promise<null>;
    listMembers(userId: number, teamId: string): Promise<import("../entities/opc-team-member.entity").OpcTeamMemberEntity[]>;
    addMember(userId: number, teamId: string, body: {
        userId: number;
        role: 'admin' | 'member';
    }): Promise<import("../entities/opc-team-member.entity").OpcTeamMemberEntity>;
    removeMember(userId: number, teamId: string, targetUserId: string): Promise<null>;
    updateMemberRole(userId: number, teamId: string, targetUserId: string, body: {
        role: 'admin' | 'member';
    }): Promise<import("../entities/opc-team-member.entity").OpcTeamMemberEntity>;
    listTasks(userId: number, teamId: string, page?: string, pageSize?: string, status?: 'pending' | 'in_progress' | 'completed'): Promise<import("../services/opc.service").Paginated<import("../entities/opc-task.entity").OpcTaskEntity>>;
    createTask(userId: number, teamId: string, body: {
        title: string;
        description?: string;
        assigneeId?: number;
        priority?: 'low' | 'medium' | 'high';
        dueDate?: Date;
    }): Promise<import("../entities/opc-task.entity").OpcTaskEntity>;
    getTask(userId: number, teamId: string, taskId: string): Promise<import("../entities/opc-task.entity").OpcTaskEntity>;
    updateTask(userId: number, teamId: string, taskId: string, body: Partial<{
        title: string;
        description: string;
        assigneeId: number;
        priority: 'low' | 'medium' | 'high';
        dueDate: Date;
        status: 'pending' | 'in_progress' | 'completed';
    }>): Promise<import("../entities/opc-task.entity").OpcTaskEntity>;
    deleteTask(userId: number, teamId: string, taskId: string): Promise<null>;
    listTeamAgents(userId: number, teamId: string): Promise<import("../entities/opc-agent-repo.entity").OpcAgentRepoEntity[]>;
    addTeamAgent(userId: number, teamId: string, body: {
        agentId: number;
    }): Promise<import("../entities/opc-agent-repo.entity").OpcAgentRepoEntity>;
    removeTeamAgent(userId: number, teamId: string, agentId: string): Promise<null>;
}
