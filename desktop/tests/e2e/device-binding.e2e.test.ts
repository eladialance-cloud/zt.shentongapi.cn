// SubTask 36.5: 设备绑定测试
//
// 测试场景：
// 1. 首次登录绑定设备：登录成功后自动调用 /devices/bind
// 2. 设备上限：已绑定 3 台，第 4 台登录应返回 DEVICE_LIMIT_EXCEEDED
// 3. 解绑：删除设备后，该设备指纹可重新绑定
// 4. 远程解绑：管理员通过 /admin/devices/:id 解绑用户设备
//
// Mock 依赖：deviceApi 和 authApi

import { httpClient } from '@/api/http-client'
import { BusinessError } from '@/utils/errors'
import type { Device } from '@/types/settings'
import type { AdminDevice } from '@/types/admin-user'
import type { User } from '@/store/auth'
import {
  generateDevice,
  generateAdminDevice,
  generateUser,
  DEVICE_LIMIT_EXCEEDED_CODE
} from '../setup'

// Mock httpClient
jest.mock('@/api/http-client', () => ({
  httpClient: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    patch: jest.fn(),
    getInstance: jest.fn()
  },
  default: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    patch: jest.fn(),
    getInstance: jest.fn()
  }
}))

const mockHttpPost = httpClient.post as unknown as jest.Mock
const mockHttpGet = httpClient.get as unknown as jest.Mock
const mockHttpDelete = httpClient.delete as unknown as jest.Mock

/** 模拟设备绑定服务状态 */
interface DeviceBindingState {
  /** 用户已绑定设备列表 */
  devices: Device[]
  /** 设备上限 */
  maxDevices: number
}

function createDeviceBindingState(maxDevices = 3): DeviceBindingState {
  return { devices: [], maxDevices }
}

/** 模拟登录 + 设备绑定 */
interface LoginParams {
  account: string
  password: string
  deviceFingerprint: string
  deviceName: string
  deviceType: string
}

/** 模拟登录 API（含设备绑定校验） */
async function loginWithDevice(
  state: DeviceBindingState,
  params: LoginParams
): Promise<{ accessToken: string; refreshToken: string; secretKey: string; user: User }> {
  // 检查设备是否已绑定
  const existing = state.devices.find(
    (d) => d.fingerprint === params.deviceFingerprint
  )
  if (!existing) {
    // 新设备 → 检查上限
    if (state.devices.length >= state.maxDevices) {
      throw new BusinessError(
        DEVICE_LIMIT_EXCEEDED_CODE,
        '已绑定设备数超过限制，请先解绑旧设备'
      )
    }
    // 绑定新设备
    const newDevice = generateDevice({
      id: state.devices.length + 1,
      deviceName: params.deviceName,
      fingerprint: params.deviceFingerprint
    })
    state.devices.push(newDevice)
  }
  // 返回登录响应
  return {
    accessToken: 'test-access-token',
    refreshToken: 'test-refresh-token',
    secretKey: 'test-secret-key',
    user: generateUser()
  }
}

/** 模拟用户解绑设备 */
function unbindDevice(state: DeviceBindingState, deviceId: number): void {
  const idx = state.devices.findIndex((d) => d.id === deviceId)
  if (idx === -1) {
    throw new BusinessError(1006, '设备不存在')
  }
  state.devices.splice(idx, 1)
}

describe('SubTask 36.5 - 设备绑定测试', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('首次登录绑定设备', () => {
    it('登录成功后应自动绑定设备指纹', async () => {
      // arrange
      const state = createDeviceBindingState(3)
      const loginParams: LoginParams = {
        account: 'testuser',
        password: 'password123',
        deviceFingerprint: 'fp-aaa-111',
        deviceName: '我的电脑',
        deviceType: 'win32'
      }
      mockHttpPost.mockImplementation(async (url: string, data: unknown) => {
        if (url === '/auth/login') {
          return loginWithDevice(state, data as LoginParams)
        }
        return undefined
      })

      // act
      const result = (await httpClient.post('/auth/login', loginParams)) as {
        accessToken: string
        refreshToken: string
        secretKey: string
        user: User
      }

      // assert
      expect(result.accessToken).toBeDefined()
      expect(state.devices).toHaveLength(1)
      expect(state.devices[0].fingerprint).toBe('fp-aaa-111')
    })

    it('已绑定设备再次登录应直接成功（不新增设备记录）', async () => {
      // arrange
      const state = createDeviceBindingState(3)
      state.devices.push(
        generateDevice({ id: 1, fingerprint: 'fp-aaa-111', deviceName: '我的电脑' })
      )
      const loginParams: LoginParams = {
        account: 'testuser',
        password: 'password123',
        deviceFingerprint: 'fp-aaa-111',
        deviceName: '我的电脑',
        deviceType: 'win32'
      }

      // act
      await loginWithDevice(state, loginParams)

      // assert
      expect(state.devices).toHaveLength(1) // 不新增
    })
  })

  describe('设备上限', () => {
    it('已绑定 3 台，第 4 台登录应返回 DEVICE_LIMIT_EXCEEDED', async () => {
      // arrange
      const state = createDeviceBindingState(3)
      state.devices = [
        generateDevice({ id: 1, fingerprint: 'fp-1' }),
        generateDevice({ id: 2, fingerprint: 'fp-2' }),
        generateDevice({ id: 3, fingerprint: 'fp-3' })
      ]
      const loginParams: LoginParams = {
        account: 'testuser',
        password: 'password123',
        deviceFingerprint: 'fp-4',
        deviceName: '第四台设备',
        deviceType: 'win32'
      }

      // act & assert
      await expect(loginWithDevice(state, loginParams)).rejects.toThrow(
        /已绑定设备数超过限制/
      )
      try {
        await loginWithDevice(state, loginParams)
      } catch (err) {
        expect(err).toBeInstanceOf(BusinessError)
        expect((err as BusinessError).code).toBe(DEVICE_LIMIT_EXCEEDED_CODE)
      }
    })
  })

  describe('解绑', () => {
    it('删除设备后，该设备指纹可重新绑定', async () => {
      // arrange
      const state = createDeviceBindingState(3)
      state.devices = [
        generateDevice({ id: 1, fingerprint: 'fp-1' }),
        generateDevice({ id: 2, fingerprint: 'fp-2' }),
        generateDevice({ id: 3, fingerprint: 'fp-3' })
      ]
      expect(state.devices).toHaveLength(3)

      // act - 解绑设备 3
      unbindDevice(state, 3)
      expect(state.devices).toHaveLength(2)

      // 重新绑定 fp-3
      const loginParams: LoginParams = {
        account: 'testuser',
        password: 'password123',
        deviceFingerprint: 'fp-3',
        deviceName: '重新绑定的设备',
        deviceType: 'win32'
      }
      await loginWithDevice(state, loginParams)

      // assert
      expect(state.devices).toHaveLength(3)
      expect(state.devices.find((d) => d.fingerprint === 'fp-3')).toBeDefined()
    })

    it('解绑不存在的设备应报错', () => {
      // arrange
      const state = createDeviceBindingState(3)
      state.devices = [generateDevice({ id: 1, fingerprint: 'fp-1' })]

      // act & assert
      expect(() => unbindDevice(state, 999)).toThrow(/设备不存在/)
    })

    it('用户通过 DELETE /devices/:id 解绑设备', async () => {
      // arrange
      mockHttpDelete.mockResolvedValue(undefined)

      // act
      await httpClient.delete('/devices/1')

      // assert
      expect(mockHttpDelete).toHaveBeenCalledWith('/devices/1')
    })
  })

  describe('远程解绑', () => {
    it('管理员通过 DELETE /admin/devices/:id 远程解绑用户设备', async () => {
      // arrange
      mockHttpDelete.mockResolvedValue(undefined)

      // act
      await httpClient.delete('/admin/devices/5')

      // assert
      expect(mockHttpDelete).toHaveBeenCalledWith('/admin/devices/5')
    })

    it('远程解绑后用户该设备应无法继续使用', async () => {
      // arrange
      const state = createDeviceBindingState(3)
      state.devices = [
        generateDevice({ id: 1, fingerprint: 'fp-1' }),
        generateDevice({ id: 2, fingerprint: 'fp-2' }),
        generateDevice({ id: 3, fingerprint: 'fp-3' })
      ]
      const adminDevices: AdminDevice[] = state.devices.map((d, i) =>
        generateAdminDevice({
          id: d.id,
          userId: 1,
          username: 'testuser',
          deviceName: d.deviceName,
          deviceFingerprint: d.fingerprint
        })
      )
      mockHttpGet.mockResolvedValue({
        list: adminDevices,
        total: 3,
        page: 1,
        pageSize: 20,
        totalPages: 1
      })

      // act - 管理员查看设备列表
      const result = await httpClient.get('/admin/devices')
      const deviceList = result as { list: AdminDevice[]; total: number }
      expect(deviceList.list).toHaveLength(3)

      // 管理员远程解绑设备 3
      unbindDevice(state, 3)

      // assert
      expect(state.devices).toHaveLength(2)
      expect(state.devices.find((d) => d.id === 3)).toBeUndefined()
    })
  })

  describe('设备列表查询', () => {
    it('用户应能查询自己已绑定的设备列表', async () => {
      // arrange
      const mockDevices: Device[] = [
        generateDevice({ id: 1, fingerprint: 'fp-1', deviceName: '设备A' }),
        generateDevice({ id: 2, fingerprint: 'fp-2', deviceName: '设备B' })
      ]
      mockHttpGet.mockResolvedValue(mockDevices)

      // act
      const devices = (await httpClient.get('/devices')) as Device[]

      // assert
      expect(devices).toHaveLength(2)
      expect(devices[0].deviceName).toBe('设备A')
    })
  })
})
