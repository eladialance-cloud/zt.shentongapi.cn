import { Repository } from 'typeorm';
import { UserEntity } from '../entities/user.entity';
import { RoleEntity } from '../entities/role.entity';
import { UserRoleEntity } from '../entities/user-role.entity';
import { EncryptionService } from '../../../common/services/encryption.service';
import { CreateUserDto } from '../dto/create-user.dto';
import { UpdateUserDto } from '../dto/update-user.dto';
import { ChangePasswordDto } from '../dto/change-password.dto';
export declare class UserService {
    private userRepo;
    private roleRepo;
    private userRoleRepo;
    private encryption;
    constructor(userRepo: Repository<UserEntity>, roleRepo: Repository<RoleEntity>, userRoleRepo: Repository<UserRoleEntity>, encryption: EncryptionService);
    findById(id: number): Promise<UserEntity>;
    findByIdWithPassword(id: number): Promise<UserEntity>;
    findByUsername(username: string): Promise<UserEntity | null>;
    findByEmail(email: string): Promise<UserEntity | null>;
    createUser(dto: CreateUserDto): Promise<UserEntity>;
    update(id: number, dto: UpdateUserDto): Promise<UserEntity>;
    changePassword(id: number, dto: ChangePasswordDto): Promise<void>;
    updatePassword(id: number, hashedPassword: string): Promise<void>;
    updateAvatar(id: number, avatarUrl: string): Promise<UserEntity>;
    findUserRoles(userId: number): Promise<string[]>;
    paginate(page: number, pageSize: number, keyword?: string): Promise<{
        list: UserEntity[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    }>;
}
