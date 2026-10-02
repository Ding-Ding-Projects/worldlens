import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);
const tools = new Set(['list_child_windows', 'mouse_click', 'win_send_keys', 'type_text', 'screenshot', 'list_headless_windows', 'win_set_control_text', 'resize_window', 'window_action']);

export function nativeClientPoint(box, pixelRatio) {
  if (!Number.isFinite(pixelRatio) || pixelRatio <= 0 || !box ||
      ![box.x, box.y, box.width, box.height].every(Number.isFinite) || box.width <= 0 || box.height <= 0) {
    throw new Error('Invalid renderer geometry for background input');
  }
  return { x: Math.round((box.x + box.width / 2) * pixelRatio), y: Math.round((box.y + box.height / 2) * pixelRatio) };
}

export function createCheapClient(executable, execute = run) {
  return async (name, params) => {
    if (!tools.has(name)) throw new Error('Tool is outside the headless UI driver scope');
    if (name !== 'list_headless_windows' && (!Number.isInteger(params?.hwnd) || params.hwnd <= 0)) {
      throw new Error('A positive background window handle is required');
    }
    if (name === 'list_headless_windows' && !params?.name) throw new Error('A named hidden desktop is required');
    const result = await execute(executable, [name, '--json', JSON.stringify(params)], {
      encoding: 'utf8', timeout: 60000, maxBuffer: 16 * 1024 * 1024, windowsHide: true,
    });
    let payload;
    try { payload = JSON.parse(result.stdout.trim()); }
    catch { throw new Error('Cheap headless tool returned invalid JSON'); }
    if (payload?.ok !== true) throw new Error('Cheap headless tool did not succeed');
    return payload;
  };
}
