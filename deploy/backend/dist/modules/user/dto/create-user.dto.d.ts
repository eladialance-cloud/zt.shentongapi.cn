export declare class CreateUserDto {
    username: string;
    email: string;
    password: string;
    inviteCode?: string;
    inviterId?: number;
    registerSource?: 'direct' | 'invite' | 'promotion';
}
