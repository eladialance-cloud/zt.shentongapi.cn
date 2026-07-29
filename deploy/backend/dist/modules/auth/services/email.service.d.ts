import { ConfigService } from '@nestjs/config';
export declare class EmailService {
    private config;
    private readonly logger;
    private transporter;
    private readonly from;
    private readonly isDev;
    constructor(config: ConfigService);
    sendPasswordResetEmail(email: string, resetLink: string): Promise<void>;
    private buildResetEmailHtml;
}
