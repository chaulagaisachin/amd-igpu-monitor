// SPDX-License-Identifier: GPL-2.0-or-later
import System from 'system';
import GLib from 'gi://GLib';
import {
    formatVram,
    formatPanelParts,
    formatPanelLine,
    readGpuInfo,
} from '../gpuReader.js';

let failures = 0;
function check(name, cond) {
    if (cond)
        print(`ok   - ${name}`);
    else {
        print(`FAIL - ${name}`);
        failures++;
    }
}

function fixturePath(...parts) {
    const [scriptPath] = GLib.filename_from_uri(import.meta.url);
    const here = GLib.path_get_dirname(scriptPath);
    return GLib.build_filenamev([here, 'fixtures', ...parts]);
}

function loadExpected() {
    const path = fixturePath('strix-halo', 'expected.json');
    const [ok, bytes] = GLib.file_get_contents(path);
    if (!ok)
        throw new Error(`missing fixture ${path}`);
    return JSON.parse(new TextDecoder().decode(bytes));
}

const MIB = 1024 * 1024;
const GIB = 1024 * MIB;

// Pure formatter
check('formatVram GiB', formatVram(GIB) === '1.0 GiB');
check('formatVram MiB', formatVram(512 * MIB) === '512 MiB');
check('formatVram null', formatVram(null) === 'n/a');
check('formatVram small total 64 MiB', formatVram(64 * MIB) === '64 MiB');
check('formatVram large total 64 GiB', formatVram(64 * GIB) === '64.0 GiB');
check('formatVram large total 128 GiB', formatVram(128 * GIB) === '128.0 GiB');
check('formatVram mixed panel string length', (() => {
    // Representative panel strings must stay fully formed (no truncation
    // in the formatter) for both short MiB and wide GiB totals.
    const small = `${formatVram(425 * MIB)} / ${formatVram(2 * GIB)}`;
    const large = `${formatVram(12 * GIB)} / ${formatVram(128 * GIB)}`;
    return small === '425 MiB / 2.0 GiB' &&
        large === '12.0 GiB / 128.0 GiB' &&
        large.length > small.length;
})());

const fullInfo = {
    usage: 42,
    tempC: 54,
    vramUsed: 512 * MIB,
    vramTotal: GIB,
};
const fullParts = formatPanelParts(fullInfo);
check('formatPanelParts null', formatPanelParts(null) === null);
check('formatPanelParts full',
    fullParts !== null &&
    fullParts.usage === '42%' &&
    fullParts.temp === '54°C' &&
    fullParts.vram === '512 MiB / 1.0 GiB');
check('formatPanelParts usage null', (() => {
    const p = formatPanelParts({...fullInfo, usage: null});
    return p !== null && p.usage === '-' &&
        p.temp === '54°C' && p.vram === '512 MiB / 1.0 GiB';
})());
check('formatPanelParts temp null', (() => {
    const p = formatPanelParts({...fullInfo, tempC: null});
    return p !== null && p.temp === '-' &&
        p.usage === '42%' && p.vram === '512 MiB / 1.0 GiB';
})());
check('formatPanelParts vram used null', (() => {
    const p = formatPanelParts({...fullInfo, vramUsed: null});
    return p !== null && p.vram === '-' &&
        p.usage === '42%' && p.temp === '54°C';
})());
check('formatPanelParts vram total null', (() => {
    const p = formatPanelParts({...fullInfo, vramTotal: null});
    return p !== null && p.vram === '-';
})());
check('formatPanelParts vram zero', (() => {
    const p = formatPanelParts({...fullInfo, vramUsed: 0});
    return p !== null && p.vram === '0 MiB / 1.0 GiB';
})());
check('formatPanelParts small total', (() => {
    const p = formatPanelParts({
        ...fullInfo,
        vramUsed: 32 * MIB,
        vramTotal: 64 * MIB,
    });
    return p !== null && p.vram === '32 MiB / 64 MiB';
})());
check('formatPanelParts large total 64 GiB', (() => {
    const p = formatPanelParts({
        ...fullInfo,
        vramUsed: 8 * GIB,
        vramTotal: 64 * GIB,
    });
    return p !== null && p.vram === '8.0 GiB / 64.0 GiB';
})());
check('formatPanelParts large total 128 GiB', (() => {
    const p = formatPanelParts({
        ...fullInfo,
        vramUsed: 40 * GIB,
        vramTotal: 128 * GIB,
    });
    return p !== null && p.vram === '40.0 GiB / 128.0 GiB';
})());
check('formatPanelParts total change between reads', (() => {
    const first = formatPanelParts({
        ...fullInfo,
        vramUsed: 425 * MIB,
        vramTotal: 2 * GIB,
    });
    const second = formatPanelParts({
        ...fullInfo,
        vramUsed: 12 * GIB,
        vramTotal: 96 * GIB,
    });
    return first !== null && second !== null &&
        first.vram === '425 MiB / 2.0 GiB' &&
        second.vram === '12.0 GiB / 96.0 GiB' &&
        first.vram !== second.vram;
})());
check('formatPanelLine null', formatPanelLine(null) === null);
check('formatPanelLine full',
    formatPanelLine(fullInfo) === '42% · 54°C · 512 MiB / 1.0 GiB');
check('formatPanelLine includes GiB unit', (() => {
    const line = formatPanelLine({
        ...fullInfo,
        vramUsed: 407 * MIB,
        vramTotal: 2 * GIB,
    });
    return line === '42% · 54°C · 407 MiB / 2.0 GiB' &&
        line.endsWith('GiB') &&
        !line.includes('…');
})());
check('formatPanelLine grows with large total', (() => {
    const small = formatPanelLine({
        ...fullInfo,
        vramUsed: 425 * MIB,
        vramTotal: 2 * GIB,
    });
    const large = formatPanelLine({
        ...fullInfo,
        vramUsed: 12 * GIB,
        vramTotal: 128 * GIB,
    });
    return small === '42% · 54°C · 425 MiB / 2.0 GiB' &&
        large === '42% · 54°C · 12.0 GiB / 128.0 GiB' &&
        large.length > small.length;
})());

// Strix Halo fixture: captured sysfs values → panel strings (no live GPU)
const expected = loadExpected();
check('strix-halo formatVram used',
    formatVram(expected.vramUsed) === expected.formatVram.used);
check('strix-halo formatVram total',
    formatVram(expected.vramTotal) === expected.formatVram.total);
const strixInfo = {
    usage: expected.usage,
    tempC: expected.tempC,
    vramUsed: expected.vramUsed,
    vramTotal: expected.vramTotal,
};
const strixParts = formatPanelParts(strixInfo);
check('strix-halo formatPanelParts usage',
    strixParts !== null && strixParts.usage === expected.panel.usage);
check('strix-halo formatPanelParts temp',
    strixParts !== null && strixParts.temp === expected.panel.temp);
check('strix-halo formatPanelParts vram',
    strixParts !== null && strixParts.vram === expected.panel.vram);

const fixtureDrm = fixturePath('strix-halo', 'sysfs');
const fixtureInfo = await readGpuInfo(fixtureDrm);
check('strix-halo fixture readGpuInfo', fixtureInfo !== null);
if (fixtureInfo !== null) {
    check('strix-halo fixture usage', fixtureInfo.usage === expected.usage);
    check('strix-halo fixture tempC', fixtureInfo.tempC === expected.tempC);
    check('strix-halo fixture clockMHz', fixtureInfo.clockMHz === expected.clockMHz);
    check('strix-halo fixture vramUsed', fixtureInfo.vramUsed === expected.vramUsed);
    check('strix-halo fixture vramTotal', fixtureInfo.vramTotal === expected.vramTotal);
    check('strix-halo fixture powerW',
        fixtureInfo.powerW !== null &&
        Math.abs(fixtureInfo.powerW - expected.powerW) < 0.0001);
    const fromReader = formatPanelParts(fixtureInfo);
    check('strix-halo fixture panel usage',
        fromReader !== null && fromReader.usage === expected.panel.usage);
    check('strix-halo fixture panel temp',
        fromReader !== null && fromReader.temp === expected.panel.temp);
    check('strix-halo fixture panel vram',
        fromReader !== null && fromReader.vram === expected.panel.vram);
}

// Re-read mem_info_vram_total each call: mutate fixture total between reads
if (fixtureInfo !== null) {
    const totalPath = GLib.build_filenamev([
        fixtureDrm, 'card1', 'device', 'mem_info_vram_total',
    ]);
    const usedPath = GLib.build_filenamev([
        fixtureDrm, 'card1', 'device', 'mem_info_vram_used',
    ]);
    const originalTotal = String(expected.vramTotal);
    const originalUsed = String(expected.vramUsed);
    const largeTotal = String(128 * GIB);
    const largeUsed = String(12 * GIB);
    try {
        GLib.file_set_contents(totalPath, `${largeTotal}\n`);
        GLib.file_set_contents(usedPath, `${largeUsed}\n`);
        const changed = await readGpuInfo(fixtureDrm);
        check('vram total changes between reads',
            changed !== null &&
            changed.vramTotal === 128 * GIB &&
            changed.vramUsed === 12 * GIB &&
            changed.vramTotal !== expected.vramTotal);
        const changedParts = formatPanelParts(changed);
        check('vram panel string follows changed total',
            changedParts !== null &&
            changedParts.vram === '12.0 GiB / 128.0 GiB');
    } finally {
        GLib.file_set_contents(totalPath, `${originalTotal}\n`);
        GLib.file_set_contents(usedPath, `${originalUsed}\n`);
    }
    const restored = await readGpuInfo(fixtureDrm);
    check('vram total restored after mutation test',
        restored !== null && restored.vramTotal === expected.vramTotal);
}

// Live amdgpu sysfs: run on a real AMD box; skip cleanly when absent (CI)
const live = await readGpuInfo();
if (live === null) {
    print('skip - live readGpuInfo (no AMD GPU in /sys/class/drm)');
} else {
    check('live readGpuInfo returns object', live !== null);
    check('live usage 0..100',
        live.usage !== null && live.usage >= 0 && live.usage <= 100);
    check('live tempC sane',
        live.tempC !== null && live.tempC > 0 && live.tempC < 120);
    check('live vramTotal > 0',
        live.vramTotal !== null && live.vramTotal > 0);
    const liveParts = formatPanelParts(live);
    check('live formatPanelParts',
        liveParts !== null &&
        typeof liveParts.usage === 'string' &&
        typeof liveParts.temp === 'string' &&
        typeof liveParts.vram === 'string');
}

if (failures > 0) {
    printerr(`${failures} test(s) failed`);
    System.exit(1);
}
print('all tests passed');
