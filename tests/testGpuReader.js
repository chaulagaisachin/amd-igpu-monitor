// SPDX-License-Identifier: GPL-2.0-or-later
import System from 'system';
import {formatVram, readGpuInfo} from '../gpuReader.js';

let failures = 0;
function check(name, cond) {
    if (cond)
        print(`ok   - ${name}`);
    else {
        print(`FAIL - ${name}`);
        failures++;
    }
}

// Pure formatter
check('formatVram GiB', formatVram(1073741824) === '1.0 GiB');
check('formatVram MiB', formatVram(536870912) === '512 MiB');
check('formatVram null', formatVram(null) === 'n/a');

// Integration against the live amdgpu sysfs on this machine
const info = readGpuInfo();
check('readGpuInfo returns object', info !== null);
if (info !== null) {
    check('usage 0..100', info.usage !== null && info.usage >= 0 && info.usage <= 100);
    check('tempC sane', info.tempC !== null && info.tempC > 0 && info.tempC < 120);
    check('vramTotal > 0', info.vramTotal !== null && info.vramTotal > 0);
}

if (failures > 0) {
    printerr(`${failures} test(s) failed`);
    System.exit(1);
}
print('all tests passed');
