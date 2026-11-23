// SPDX-License-Identifier: GPL-2.0-or-later
import Gio from 'gi://Gio';

const DEFAULT_DRM_DIR = '/sys/class/drm';
const _decoder = new TextDecoder();

export function readText(path) {
    const file = Gio.File.new_for_path(path);
    return new Promise((resolve) => {
        file.load_contents_async(null, (f, res) => {
            try {
                const [ok, bytes] = f.load_contents_finish(res);
                resolve(ok ? _decoder.decode(bytes).trim() : null);
            } catch (_e) {
                resolve(null);
            }
        });
    });
}

export async function readNumber(path) {
    const t = await readText(path);
    if (t === null)
        return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
}

function _listMatching(dirPath, regex) {
    const names = [];
    const dir = Gio.File.new_for_path(dirPath);
    let iter;
    try {
        iter = dir.enumerate_children(
            'standard::name', Gio.FileQueryInfoFlags.NONE, null);
    } catch (_e) {
        return names;
    }
    let info;
    while ((info = iter.next_file(null)) !== null) {
        const name = info.get_name();
        if (regex.test(name))
            names.push(name);
    }
    iter.close(null);
    names.sort();
    return names;
}

export async function findAmdCardPath(drmDir = DEFAULT_DRM_DIR) {
    for (const card of _listMatching(drmDir, /^card\d+$/)) {
        const devicePath = `${drmDir}/${card}/device`;
        if (await readText(`${devicePath}/vendor`) === '0x1002')
            return devicePath;
    }
    return null;
}

export function findHwmonPath(devicePath) {
    const [first] = _listMatching(`${devicePath}/hwmon`, /^hwmon\d+$/);
    return first ? `${devicePath}/hwmon/${first}` : null;
}

export function formatVram(bytes) {
    if (bytes === null)
        return 'n/a';
    const mib = bytes / (1024 * 1024);
    if (mib >= 1024)
        return `${(mib / 1024).toFixed(1)} GiB`;
    return `${Math.round(mib)} MiB`;
}

export function formatPanelParts(info) {
    if (info === null)
        return null;
    const usage = info.usage === null ? '-' : `${info.usage}%`;
    const temp = info.tempC === null ? '-' : `${info.tempC}°C`;
    const vram = (info.vramUsed === null || info.vramTotal === null)
        ? '-'
        : `${formatVram(info.vramUsed)} / ${formatVram(info.vramTotal)}`;
    return {usage, temp, vram};
}

/** Single top-bar line: usage · temp · vram (one St.Label, no multi-actor clip). */
export function formatPanelLine(info) {
    const parts = formatPanelParts(info);
    if (parts === null)
        return null;
    return `${parts.usage} · ${parts.temp} · ${parts.vram}`;
}

export async function readGpuInfo(drmDir = DEFAULT_DRM_DIR) {
    const devicePath = await findAmdCardPath(drmDir);
    if (devicePath === null)
        return null;

    const hwmon = findHwmonPath(devicePath);
    const none = Promise.resolve(null);

    const [usage, vramUsed, vramTotal, tRaw, pAvg, pInput, fRaw] =
        await Promise.all([
            readNumber(`${devicePath}/gpu_busy_percent`),
            readNumber(`${devicePath}/mem_info_vram_used`),
            readNumber(`${devicePath}/mem_info_vram_total`),
            hwmon ? readNumber(`${hwmon}/temp1_input`) : none,
            hwmon ? readNumber(`${hwmon}/power1_average`) : none,
            hwmon ? readNumber(`${hwmon}/power1_input`) : none,
            hwmon ? readNumber(`${hwmon}/freq1_input`) : none,
        ]);

    const tempC = tRaw === null ? null : Math.round(tRaw / 1000);
    const pRaw = pAvg === null ? pInput : pAvg;
    const powerW = pRaw === null ? null : pRaw / 1000000;
    const clockMHz = fRaw === null ? null : Math.round(fRaw / 1000000);

    return {usage, tempC, powerW, clockMHz, vramUsed, vramTotal};
}
