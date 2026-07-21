// SPDX-License-Identifier: GPL-2.0-or-later
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

const DRM_DIR = '/sys/class/drm';
const _decoder = new TextDecoder();

export function readText(path) {
    try {
        const [ok, bytes] = GLib.file_get_contents(path);
        if (!ok)
            return null;
        return _decoder.decode(bytes).trim();
    } catch (_e) {
        return null;
    }
}

export function readNumber(path) {
    const t = readText(path);
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

export function findAmdCardPath() {
    for (const card of _listMatching(DRM_DIR, /^card\d+$/)) {
        const devicePath = `${DRM_DIR}/${card}/device`;
        if (readText(`${devicePath}/vendor`) === '0x1002')
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

export function readGpuInfo() {
    const devicePath = findAmdCardPath();
    if (devicePath === null)
        return null;

    const usage = readNumber(`${devicePath}/gpu_busy_percent`);
    const vramUsed = readNumber(`${devicePath}/mem_info_vram_used`);
    const vramTotal = readNumber(`${devicePath}/mem_info_vram_total`);

    let tempC = null, powerW = null, clockMHz = null;
    const hwmon = findHwmonPath(devicePath);
    if (hwmon !== null) {
        const t = readNumber(`${hwmon}/temp1_input`);
        tempC = t === null ? null : Math.round(t / 1000);

        let p = readNumber(`${hwmon}/power1_average`);
        if (p === null)
            p = readNumber(`${hwmon}/power1_input`);
        powerW = p === null ? null : p / 1000000;

        const f = readNumber(`${hwmon}/freq1_input`);
        clockMHz = f === null ? null : Math.round(f / 1000000);
    }

    return {usage, tempC, powerW, clockMHz, vramUsed, vramTotal};
}
