export declare class CreateSkillSourceDto {
    sourceUrl: string;
    sourceType: 'github';
    skillName: string;
    skillDesc: string;
    skillType: 'skill' | 'workflow';
}
export declare class SkillSourceQueryDto {
    page?: number;
    pageSize?: number;
    status?: string;
    skillType?: string;
}
