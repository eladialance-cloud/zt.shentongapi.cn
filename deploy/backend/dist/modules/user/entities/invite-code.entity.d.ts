export declare class InviteCodeEntity {
    id: number;
    code: string;
    inviterId: number;
    inviteeId: number | null;
    status: string;
    expiresAt: Date;
    createdAt: Date;
}
