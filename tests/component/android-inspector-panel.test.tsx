import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { InspectorSnapshot } from '@domain/android-inspector/android-inspector';
import type { AndroidSelectorTarget } from '@domain/android-inspector/android-selector';
import type { StudioHostApi } from '@infrastructure/electron/studio-host-api';
import { AndroidInspectorPanel } from '@presentation/features/android-inspector/AndroidInspectorPanel';

const snapshot: InspectorSnapshot = {
  snapshotId: 'snapshot-1',
  deviceId: 'emulator-5554',
  capturedAt: '2026-11-07T10:00:00.000Z',
  screenshot: {
    mimeType: 'image/png',
    width: 100,
    height: 200,
    bytes: Uint8Array.from([137, 80, 78, 71]),
  },
  screen: { width: 100, height: 200 },
  nodes: [
    {
      nodeId: 'node-0',
      traversalIndex: 0,
      depth: 0,
      packageName: 'com.example',
      className: 'android.widget.FrameLayout',
      bounds: { left: 0, top: 0, right: 100, bottom: 200 },
      clickable: false,
      enabled: true,
    },
    {
      nodeId: 'node-1',
      parentId: 'node-0',
      traversalIndex: 1,
      depth: 1,
      packageName: 'com.example',
      resourceId: 'com.example:id/login',
      className: 'android.widget.Button',
      text: 'Login',
      bounds: { left: 40, top: 80, right: 60, bottom: 120 },
      clickable: true,
      enabled: true,
    },
  ],
  warnings: [],
};

let revokeObjectUrl: ReturnType<typeof vi.fn>;

function installHost(capture = vi.fn(async () => ({ ok: true as const, value: snapshot }))) {
  window.studioHost = {
    androidInspector: {
      listDevices: vi.fn(async () => ({
        ok: true as const,
        value: [
          {
            deviceId: 'emulator-5554',
            model: 'Pixel 8',
            status: 'device' as const,
            usable: true,
          },
          {
            deviceId: 'offline-1',
            model: 'Offline phone',
            status: 'offline' as const,
            usable: false,
          },
        ],
      })),
      capture,
    },
  } as unknown as StudioHostApi;
  return capture;
}

beforeEach(() => {
  revokeObjectUrl = vi.fn();
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn(async () => undefined) },
  });
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => 'blob:android-snapshot'),
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: revokeObjectUrl,
  });
});

afterEach(() => {
  cleanup();
  window.studioHost = undefined;
  vi.restoreAllMocks();
});

describe('AndroidInspectorPanel', () => {
  it('lists devices, captures a snapshot, hit-tests candidates and copies resource ID', async () => {
    const user = userEvent.setup();
    const clipboardWrite = vi.spyOn(navigator.clipboard, 'writeText');
    const capture = installHost();
    const { unmount } = render(
      <AndroidInspectorPanel collapsed={false} onCollapse={vi.fn()} onExpand={vi.fn()} />,
    );

    await screen.findByRole('option', { name: 'Pixel 8 — emulator-5554' });
    expect(screen.getByRole('option', { name: /Offline phone/ })).toBeDisabled();
    await user.selectOptions(screen.getByLabelText('Android device'), 'emulator-5554');
    await user.click(screen.getByRole('button', { name: 'Inspect' }));

    const viewport = await screen.findByRole('button', { name: 'Inspect Android snapshot' });
    expect(capture).toHaveBeenCalledWith({ deviceId: 'emulator-5554' });
    Object.defineProperty(viewport, 'getBoundingClientRect', {
      value: () => ({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: 200,
        bottom: 400,
        width: 200,
        height: 400,
        toJSON: () => ({}),
      }),
    });
    fireEvent.click(viewport, { clientX: 100, clientY: 200 });

    expect(screen.getByLabelText('2 matching elements')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Use in node' })).toBeDisabled();
    expect(
      screen.getByText('Button').compareDocumentPosition(screen.getByText('FrameLayout')) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getAllByText('com.example:id/login').length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: 'Copy resource ID' }));
    expect(clipboardWrite).toHaveBeenCalledWith('com.example:id/login');
    expect(screen.getByRole('button', { name: 'Copied resource ID' })).toBeInTheDocument();

    unmount();
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:android-snapshot');
  });

  it('keeps the last snapshot and marks it outdated after a failed refresh', async () => {
    const user = userEvent.setup();
    const capture = vi
      .fn()
      .mockResolvedValueOnce({ ok: true as const, value: snapshot })
      .mockResolvedValueOnce({
        ok: false as const,
        error: { code: 'SCREENSHOT_FAILED' as const, message: 'Capture failed.', retryable: true },
      });
    installHost(capture);
    render(<AndroidInspectorPanel collapsed={false} onCollapse={vi.fn()} onExpand={vi.fn()} />);

    await screen.findByRole('option', { name: 'Pixel 8 — emulator-5554' });
    await user.selectOptions(screen.getByLabelText('Android device'), 'emulator-5554');
    await user.click(screen.getByRole('button', { name: 'Inspect' }));
    await screen.findByAltText('Android snapshot from emulator-5554');
    await user.click(screen.getByRole('button', { name: 'Inspect' }));

    await screen.findByText('Capture failed.');
    expect(screen.getByAltText('Android snapshot from emulator-5554')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/Outdated/)).toBeInTheDocument());
  });

  it('copies a structured selector and applies it only to an explicit workflow target', async () => {
    const user = userEvent.setup();
    const clipboardWrite = vi.spyOn(navigator.clipboard, 'writeText');
    const target: AndroidSelectorTarget = {
      nodeId: 'tap-1',
      nodeLabel: 'Tap element',
      propertyName: 'target',
      propertyTitle: 'Target element',
    };
    const onUseSelector = vi.fn(() => true);
    installHost();
    render(
      <AndroidInspectorPanel
        collapsed={false}
        selectorTargets={[target]}
        onCollapse={vi.fn()}
        onExpand={vi.fn()}
        onUseSelector={onUseSelector}
      />,
    );

    await screen.findByRole('option', { name: 'Pixel 8 — emulator-5554' });
    await user.selectOptions(screen.getByLabelText('Android device'), 'emulator-5554');
    await user.click(screen.getByRole('button', { name: 'Inspect' }));
    const viewport = await screen.findByRole('button', { name: 'Inspect Android snapshot' });
    Object.defineProperty(viewport, 'getBoundingClientRect', {
      value: () => ({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: 100,
        bottom: 200,
        width: 100,
        height: 200,
        toJSON: () => ({}),
      }),
    });
    fireEvent.click(viewport, { clientX: 50, clientY: 100 });

    await user.click(screen.getByRole('button', { name: 'Copy selector' }));
    expect(clipboardWrite).toHaveBeenCalledWith(
      JSON.stringify(
        {
          schemaVersion: 1,
          strategy: 'resourceId',
          value: 'com.example:id/login',
          packageName: 'com.example',
        },
        null,
        2,
      ),
    );

    await user.click(screen.getByRole('button', { name: 'Use in node' }));
    expect(onUseSelector).toHaveBeenCalledWith(target, {
      schemaVersion: 1,
      strategy: 'resourceId',
      value: 'com.example:id/login',
      packageName: 'com.example',
    });
    expect(screen.getByRole('button', { name: 'Used in node' })).toBeInTheDocument();
  });

  it('ignores a completed capture after the user changes device', async () => {
    const user = userEvent.setup();
    let finishCapture!: (result: { ok: true; value: InspectorSnapshot }) => void;
    const pendingCapture = new Promise<{ ok: true; value: InspectorSnapshot }>((resolve) => {
      finishCapture = resolve;
    });
    window.studioHost = {
      androidInspector: {
        listDevices: vi.fn(async () => ({
          ok: true as const,
          value: [
            { deviceId: 'emulator-5554', status: 'device' as const, usable: true },
            { deviceId: 'emulator-5556', status: 'device' as const, usable: true },
          ],
        })),
        capture: vi.fn(async () => pendingCapture),
      },
    } as unknown as StudioHostApi;
    render(<AndroidInspectorPanel collapsed={false} onCollapse={vi.fn()} onExpand={vi.fn()} />);

    await screen.findByRole('option', { name: 'Android device — emulator-5554' });
    const select = screen.getByLabelText('Android device');
    await user.selectOptions(select, 'emulator-5554');
    await user.click(screen.getByRole('button', { name: 'Inspect' }));
    await user.selectOptions(select, 'emulator-5556');
    await act(async () => finishCapture({ ok: true, value: snapshot }));

    await waitFor(() => {
      expect(screen.queryByAltText('Android snapshot from emulator-5554')).not.toBeInTheDocument();
    });
    expect(select).toHaveValue('emulator-5556');
  });
});
