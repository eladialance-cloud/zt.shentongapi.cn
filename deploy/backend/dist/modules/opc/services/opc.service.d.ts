import { DataSource, Repository } from 'typeorm';
import { OpcTeamEntity } from '../entities/opc-team.entity';
import { OpcTeamMemberEntity } from '../entities/opc-team-member.entity';
import { OpcTaskEntity } from '../entities/opc-task.entity';
import { OpcAgentRepoEntity } from '../entities/opc-agent-repo.entity';
type OpcTaskStatus = 'pending' | 'in_progress' | 'completed';
type OpcTaskPriority = 'low' | 'medium' | 'high';
type OpcMemberRole = 'owner' | 'admin' | 'member';
export interface Paginated<T> {
    list: T[];
    total: number;
    page: number;
    pageSize: number;
}
export declare class OpcService {
    private readonly teamRepo;
    private readonly memberRepo;
    private readonly taskRepo;
    private readonly agentRepo;
    private readonly dataSource;
    constructor(teamRepo: Repository<OpcTeamEntity>, memberRepo: Repository<OpcTeamMemberEntity>, taskRepo: Repository<OpcTaskEntity>, agentRepo: Repository<OpcAgentRepoEntity>, dataSource: DataSource);
    health(): {
        status: string;
        module: string;
    };
    listTeams(userId: number, page?: number, pageSize?: number): Promise<Paginated<OpcTeamEntity>>;
    createTeam(userId: number, data: {
        name: string;
        description?: string;
        avatar?: string;
    }): Promise<OpcTeamEntity>;
    getTeamDetail(userId: number, teamId: number): Promise<{
        team: OpcTeamEntity;
        role: OpcMemberRole;
    }>;
    updateTeam(userId: number, teamId: number, data: {
        name?: string;
        description?: string;
        avatar?: string;
    }): Promise<OpcTeamEntity>;
    deleteTeam(userId: number, teamId: number): Promise<void>;
    listMembers(userId: number, teamId: number): Promise<OpcTeamMemberEntity[]>;
    addMember(userId: number, teamId: number, targetUserId: number, role: 'admin' | 'member'): Promise<OpcTeamMemberEntity>;
    removeMember(userId: number, teamId: number, targetUserId: number): Promise<void>;
    updateMemberRole(userId: number, teamId: number, targetUserId: number, role: 'admin' | 'member'): Promise<OpcTeamMemberEntity>;
    listTasks(userId: number, teamId: number, page?: number, pageSize?: number, status?: OpcTaskStatus): Promise<Paginated<OpcTaskEntity>>;
    createTask(userId: number, teamId: number, data: {
        title: string;
        description?: string;
        assigneeId?: number;
        priority?: OpcTaskPriority;
        dueDate?: Date;
    }): Promise<OpcTaskEntity>;
    getTask(userId: number, teamId: number, taskId: number): Promise<OpcTaskEntity>;
    updateTask(userId: number, teamId: number, taskId: number, data: Partial<{
        title: string;
        description: string;
        assigneeId: number;
        priority: OpcTaskPriority;
        dueDate: Date;
        status: OpcTaskStatus;
    }>): Promise<OpcTaskEntity>;
    deleteTask(userId: number, teamId: number, taskId: number): Promise<void>;
    listTeamAgents(userId: number, teamId: number): Promise<OpcAgentRepoEntity[]>;
    addTeamAgent(userId: number, teamId: number, agentId: number): Promise<OpcAgentRepoEntity>;
    removeTeamAgent(userId: number, teamId: number, agentId: number): Promise<void>;
    private assertMember;
    private assertAdmin;
    private assertOwner;
}
export {};
