import { Repository } from 'typeorm';
import { DeviceEntity } from './entities/device.entity';
import { BindDeviceDto } from './dto/bind-device.dto';
export declare class DeviceService {
    private deviceRepo;
    constructor(deviceRepo: Repository<DeviceEntity>);
    bindDevice(userId: number, dto: BindDeviceDto, ip: string): Promise<DeviceEntity>;
    listDevices(userId: number): Promise<DeviceEntity[]>;
    unbindDevice(userId: number, deviceId: number): Promise<void>;
    unbindByFingerprint(userId: number, fingerprint: string): Promise<void>;
    checkDeviceLimit(userId: number): Promise<boolean>;
    getUserDeviceCount(userId: number): Promise<number>;
    findByFingerprint(userId: number, fingerprint: string): Promise<DeviceEntity | null>;
    updateLoginInfo(deviceId: number, ip: string): Promise<void>;
    adminListDevices(userId: number): Promise<DeviceEntity[]>;
    adminUnbindDevice(deviceId: number): Promise<void>;
}
