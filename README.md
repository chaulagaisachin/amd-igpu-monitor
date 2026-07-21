# AMD iGPU Monitor

A GNOME Shell extension that shows AMD integrated GPU stats in the top bar:
usage %, temperature, power, core clock, and VRAM. It reads the kernel `amdgpu`
sysfs interface directly, so it needs no ROCm and no external tools.

## Requirements

- GNOME Shell 46, 47, or 48
- An AMD GPU using the `amdgpu` kernel driver

## Install (from source)

```bash
gnome-extensions pack --force --extra-source=gpuReader.js .
gnome-extensions install --force amd-igpu-monitor@chaulagaisachin.shell-extension.zip
```

Log out and back in, then enable "AMD iGPU Monitor" (or run
`gnome-extensions enable amd-igpu-monitor@chaulagaisachin`).

## What it reads

| Metric | sysfs source |
|--------|--------------|
| Usage % | `card*/device/gpu_busy_percent` |
| Temperature | `card*/device/hwmon/hwmon*/temp1_input` |
| Power | `card*/device/hwmon/hwmon*/power1_average` |
| Core clock | `card*/device/hwmon/hwmon*/freq1_input` |
| VRAM used/total | `card*/device/mem_info_vram_used` and `mem_info_vram_total` |

The AMD card is detected at runtime by its PCI vendor id `0x1002`.

## License

GPL-2.0-or-later. See `LICENSE`.
