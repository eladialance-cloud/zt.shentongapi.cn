import { UserService } from '../services/user.service';
import { InviteCodeService } from '../invite-code.service';
import { UpdateUserDto } from '../dto/update-user.dto';
import { ChangePasswordDto } from '../dto/change-password.dto';
import { ICurrentUser } from '../../../common/decorators/current-user.decorator';
export declare class UserController {
    private userService;
    private inviteCodeService;
    constructor(userService: UserService, inviteCodeService: InviteCodeService);
    getProfile(user: ICurrentUser): Promise<{
        id: number;
        username: string;
        email: string;
        phone: string | undefined;
        avatar: string | undefined;
        status: "active" | "banned";
        level: number;
        roles: string[];
        createdAt: Date;
        updatedAt: Date;
    }>;
    changePassword(dto: ChangePasswordDto, user: ICurrentUser): Promise<void>;
    uploadAvatar(user: ICurrentUser, file: Express.Multer.File): Promise<import("../entities/user.entity").UserEntity>;
    update(id: number, dto: UpdateUserDto, currentUser: ICurrentUser): Promise<import("../entities/user.entity").UserEntity>;
    generateInviteCode(user: ICurrentUser): Promise<import("../entities/invite-code.entity").InviteCodeEntity>;
    listMyInviteCodes(user: ICurrentUser): Promise<import("../entities/invite-code.entity").InviteCodeEntity[]>;
    getInviteStats(user: ICurrentUser): Promise<{
        total: number;
        used: number;
        active: number;
    }>;
}
