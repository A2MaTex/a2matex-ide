import { describe, expect, it, vi } from 'vitest';

import {
  parseAdbDevices,
  ProcessAdbClient,
  type AdbProcessRunner,
} from '@electron/main/adapters/android/adb-client';

describe('ADB device parsing', () => {
  it('parses usable, offline and unauthorized devices without hiding status', () => {
    const devices = parseAdbDevices(`List of devices attached
emulator-5554 device product:sdk_phone model:Pixel_8 device:emu transport_id:1
R58M offline model:Galaxy_S23 transport_id:2
ABC unauthorized transport_id:3
`);

    expect(devices).toEqual([
      {
        deviceId: 'emulator-5554',
        status: 'device',
        usable: true,
        model: 'Pixel 8',
        product: 'sdk_phone',
        deviceName: 'emu',
        transportId: '1',
      },
      {
        deviceId: 'R58M',
        status: 'offline',
        usable: false,
        model: 'Galaxy S23',
        transportId: '2',
      },
      {
        deviceId: 'ABC',
        status: 'unauthorized',
        usable: false,
        transportId: '3',
      },
    ]);
  });

  it('passes the selected serial as an argument and cleans up hierarchy files', async () => {
    const calls: string[][] = [];
    const runner: AdbProcessRunner = {
      run: vi.fn(async (args) => {
        calls.push([...args]);
        if (args.includes('cat')) return Buffer.from('<hierarchy />');
        return Buffer.alloc(0);
      }),
    };
    const client = new ProcessAdbClient(runner);

    await expect(
      client.captureHierarchy('emulator-5554', '/sdcard/a2matex-test.xml'),
    ).resolves.toBe('<hierarchy />');
    expect(calls).toEqual([
      [
        '-s',
        'emulator-5554',
        'shell',
        'uiautomator',
        'dump',
        '--compressed',
        '/sdcard/a2matex-test.xml',
      ],
      ['-s', 'emulator-5554', 'exec-out', 'cat', '/sdcard/a2matex-test.xml'],
      ['-s', 'emulator-5554', 'shell', 'rm', '-f', '/sdcard/a2matex-test.xml'],
    ]);
  });
});
