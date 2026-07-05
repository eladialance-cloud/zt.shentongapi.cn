import { ConfigService } from '@nestjs/config';
export declare class EncryptionService {
    private config;
    private readonly saltRounds;
    private readonly aesKey;
    constructor(config: ConfigService);
    hash(plain: string): Promise<string>;
    compare(plain: string, hash: string): Promise<boolean>;
    encryptAes(plain: string): string;
    decryptAes(cipherText: string): string;
}
