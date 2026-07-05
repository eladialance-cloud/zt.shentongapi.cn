import type { Request } from 'express';
import { DeviceService } from './device.service';
import { BindDeviceDto } from './dto/bind-device.dto';
import { ICurrentUser } from '../../common/decorators/current-user.decorator';
export declare class DeviceController {
    private deviceService;
    constructor(deviceService: DeviceService);
    bind(dto: BindDeviceDto, user: ICurrentUser, req: Request): Promise<import("./entities/device.entity").DeviceEntity>;
    list(user: ICurrentUser): Promise<import("./entities/device.entity").DeviceEntity[]>;
    unbind(id: number, user: ICurrentUser): Promise<null>;
}
export declare class AdminDeviceController {
    private deviceService;
    constructor(deviceService: DeviceService);
    listUserDevices(userId: number): Promise<import("./entities/device.entity").DeviceEntity[]>;
    unbindUserDevice(userId: number, deviceId: number): Promise<null>;
}
