import { Repository } from 'typeorm';
import { AgentEntity } from '../entities/agent.entity';
import { AgentFavoriteEntity } from '../entities/agent-favorite.entity';
import { AgentCallLogEntity } from '../entities/agent-call-log.entity';
import { AgentReviewEntity } from '../entities/agent-review.entity';
import { ICurrentUser } from '../../../common/decorators/current-user.decorator';
export declare class AgentController {
    private readonly agentRepo;
    private readonly favoriteRepo;
    private readonly callLogRepo;
    private readonly reviewRepo;
    constructor(agentRepo: Repository<AgentEntity>, favoriteRepo: Repository<AgentFavoriteEntity>, callLogRepo: Repository<AgentCallLogEntity>, reviewRepo: Repository<AgentReviewEntity>);
    health(): {
        status: string;
        module: string;
    };
    list(page?: string, pageSize?: string, category?: string, keyword?: string, sort?: string): Promise<{
        list: {
            id: number;
            name: string;
            description: string;
            avatar: string | undefined;
            category: "office" | "programming" | "copywriting" | "data_analysis" | "other";
            tags: string[];
            modelId: string;
            pricePerCall: number;
            rating: number;
            ratingCount: number;
            callCount: number;
            isOfficial: boolean;
            sourceCategory: string | undefined;
        }[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    }>;
    categories(): Promise<{
        category: string;
        displayName: string;
        agentCount: number;
    }[]>;
    listFavorites(user: ICurrentUser): Promise<{
        id: number;
        name: string;
        description: string;
        avatar: string | undefined;
        category: "office" | "programming" | "copywriting" | "data_analysis" | "other";
        tags: string[];
        rating: number;
        callCount: number;
        isOfficial: boolean;
        isFavorited: boolean;
    }[]>;
    favorite(id: number, user: ICurrentUser): Promise<{
        success: boolean;
    }>;
    unfavorite(id: number, user: ICurrentUser): Promise<{
        success: boolean;
    }>;
    usageLogs(user: ICurrentUser, page?: string, pageSize?: string): Promise<{
        list: AgentCallLogEntity[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    }>;
    listReviews(id: number): Promise<AgentReviewEntity[]>;
    createReview(id: number, body: {
        rating: number;
        comment?: string;
    }, user: ICurrentUser): Promise<{
        agentId: number;
        reviewerId: number;
        action: "approve";
        reason: string;
    } & AgentReviewEntity>;
    detail(id: number): Promise<{
        code: number;
        message: string;
        data: null;
        id?: undefined;
        name?: undefined;
        description?: undefined;
        avatar?: undefined;
        usageExample?: undefined;
        category?: undefined;
        tags?: undefined;
        modelId?: undefined;
        pricePerCall?: undefined;
        rating?: undefined;
        ratingCount?: undefined;
        callCount?: undefined;
        isOfficial?: undefined;
        sourceCategory?: undefined;
        sourceName?: undefined;
        createdAt?: undefined;
        publishedAt?: undefined;
    } | {
        id: number;
        name: string;
        description: string;
        avatar: string | undefined;
        usageExample: string | undefined;
        category: "office" | "programming" | "copywriting" | "data_analysis" | "other";
        tags: string[];
        modelId: string;
        pricePerCall: number;
        rating: number;
        ratingCount: number;
        callCount: number;
        isOfficial: boolean;
        sourceCategory: string | undefined;
        sourceName: string | undefined;
        createdAt: string;
        publishedAt: string | undefined;
        code?: undefined;
        message?: undefined;
        data?: undefined;
    }>;
}
