import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';

let electronApp: ElectronApplication | undefined;
let projectRoot: string;

test.beforeEach(async () => {
  projectRoot = await mkdtemp(path.join(tmpdir(), 'a2matex-e2e-'));
  const launchEnvironment = { ...process.env };
  delete launchEnvironment.ELECTRON_RUN_AS_NODE;

  electronApp = await electron.launch({
    args: ['.'],
    env: {
      ...launchEnvironment,
      A2MATEX_E2E: '1',
      A2MATEX_E2E_PROJECT_ROOT: projectRoot,
    },
  });
});

test.afterEach(async () => {
  await electronApp?.close();
  await rm(projectRoot, { recursive: true, force: true });
});

test('opens the Projects screen through an isolated renderer', async () => {
  if (!electronApp) throw new Error('Electron did not launch');
  const window = await electronApp.firstWindow();

  await expect(window.getByRole('heading', { name: /build android automation/i })).toBeVisible();
  await expect(window.getByText('Desktop host connected')).toBeVisible();

  const security = await window.evaluate(async () => {
    const api = window.studioHost;
    const info = await api?.system.getInfo();

    return {
      hasNodeProcess: typeof (window as unknown as { process?: unknown }).process !== 'undefined',
      hasRequire: typeof (window as unknown as { require?: unknown }).require !== 'undefined',
      runtime: info?.runtime,
    };
  });

  expect(security).toEqual({
    hasNodeProcess: false,
    hasRequire: false,
    runtime: 'desktop',
  });
});

test('authors, validates, saves, and reopens the four-node workflow', async () => {
  if (!electronApp) throw new Error('Electron did not launch');
  const window = await electronApp.firstWindow();

  await window.getByRole('button', { name: 'New project' }).click();
  await window.getByLabel('Project name').fill('Visual flow');
  await window.getByRole('button', { name: 'Choose folder & create' }).click();
  await expect(window.getByRole('region', { name: 'Workflow canvas' })).toBeVisible();

  for (const name of ['Start', 'Delay', 'Tap', 'Log']) {
    await window
      .getByRole('region', { name: 'Node palette' })
      .getByRole('button', { name: new RegExp('^' + name) })
      .click();
  }
  await expect(window.locator('.react-flow__node')).toHaveCount(4);
  await window.getByRole('button', { name: 'Fit View' }).click();

  const connect = async (sourceName: string, targetName: string, expectedEdges: number) => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await window.getByRole('button', { name: 'Fit View' }).click();
      const source = window
        .locator('.react-flow__node')
        .filter({ hasText: sourceName })
        .locator('.react-flow__handle.source');
      const target = window
        .locator('.react-flow__node')
        .filter({ hasText: targetName })
        .locator('.react-flow__handle.target');
      const sourceBox = await source.boundingBox();
      const targetBox = await target.boundingBox();
      if (!sourceBox || !targetBox) throw new Error('Connection handle is not visible');
      await window.mouse.move(
        sourceBox.x + sourceBox.width / 2,
        sourceBox.y + sourceBox.height / 2,
      );
      await window.mouse.down();
      await window.mouse.move(
        targetBox.x + targetBox.width / 2,
        targetBox.y + targetBox.height / 2,
        { steps: 8 },
      );
      await window.mouse.up();
      try {
        await expect(window.locator('.react-flow__edge')).toHaveCount(expectedEdges, {
          timeout: 1200,
        });
        return;
      } catch {
        if (attempt === 2) throw new Error('Could not create visual connection');
      }
    }
  };

  await connect('Start', 'Delay', 1);
  await connect('Delay', 'Tap', 2);
  await connect('Tap', 'Log', 3);
  await expect(window.getByText('No workflow problems detected.')).toBeVisible();

  await window.locator('.react-flow__node').filter({ hasText: 'Delay' }).click();
  const duration = window.getByLabel('Duration');
  await duration.fill('-1');
  await duration.press('Tab');
  const durationIssue = window.getByRole('button', { name: /Duration has an invalid value/ });
  await expect(durationIssue).toBeVisible();

  await window.locator('.react-flow__node').filter({ hasText: 'Start' }).click();
  await durationIssue.click();
  await expect(window.getByLabel('Duration')).toHaveValue('-1');
  await window.getByRole('button', { name: 'Undo' }).click();
  await expect(window.getByLabel('Duration')).toHaveValue('1000');

  await duration.fill('1500');
  await duration.press('Tab');

  await window.getByRole('button', { name: 'Undo' }).click();
  await expect(duration).toHaveValue('1000');
  await window.getByRole('button', { name: 'Redo' }).click();
  await expect(window.getByLabel('Duration')).toHaveValue('1500');

  await window.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(window.getByText('saved', { exact: true })).toBeVisible();

  const workflow = JSON.parse(
    await readFile(
      path.join(projectRoot, 'visual-flow', 'workflows', 'main.workflow.json'),
      'utf8',
    ),
  ) as {
    nodes: Array<{ type: string; params: Record<string, unknown> }>;
    edges: unknown[];
  };
  expect(workflow.nodes.map((node) => node.type)).toEqual([
    'trigger.start',
    'flow.delay',
    'android.tap',
    'debug.log',
  ]);
  expect(workflow.nodes[1].params.durationMs).toBe(1500);
  expect(workflow.edges).toHaveLength(3);

  await window.getByRole('button', { name: 'Close' }).click();
  await window.getByRole('button', { name: /Visual flow/ }).click();
  await expect(window.locator('.react-flow__node')).toHaveCount(4);
  await expect(window.locator('.react-flow__edge')).toHaveCount(3);
  await window.locator('.react-flow__node').filter({ hasText: 'Delay' }).click();
  await expect(window.getByLabel('Duration')).toHaveValue('1500');
});
