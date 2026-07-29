export interface ICurrentUser {
    userId: number;
    username: string;
    email: string;
    roles: string[];
}
export declare const CurrentUser: (...dataOrPipes: (keyof ICurrentUser | import("@nestjs/common").PipeTransform<any, any> | import("@nestjs/common").Type<import("@nestjs/common").PipeTransform<any, any>> | undefined)[]) => ParameterDecorator;
