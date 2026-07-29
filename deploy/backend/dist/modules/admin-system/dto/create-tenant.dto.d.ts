export declare class TenantQuotaDto {
    users: number;
    calls: number;
    storage: number;
}
export declare class CreateTenantDto {
    name: string;
    quota: TenantQuotaDto;
}
