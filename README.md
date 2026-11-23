# AMD iGPU Monitor

A GNOME Shell extension that shows AMD integrated GPU stats in the top bar:
usage %, temperature, and VRAM used/total. Power and core clock stay in
the popup. It reads the kernel `amdgpu` sysfs interface directly, so it
needs no ROCm and no external tools. Each metric uses a bundled Lucide
symbolic icon (circle-gauge, thermometer, gpu) that follows panel text
color.

## Requirements

- GNOME Shell 46, 47, 48, or 50
- An AMD GPU using the `amdgpu` kernel driver

## Install (from source)

```bash
gnome-shell --version
```

The major version must be 46, 47, 48, or 50. If it is not, stop. Do not
edit `metadata.json` to force another version.

```bash
echo "$XDG_SESSION_TYPE"
gnome-extensions pack --force \
  --extra-source=gpuReader.js \
  --extra-source=icons \
  --extra-source=LICENSE.lucide \
  .
gnome-extensions install --force amd-igpu-monitor@chaulagaisachin.shell-extension.zip
gnome-extensions enable amd-igpu-monitor@chaulagaisachin
gnome-extensions info amd-igpu-monitor@chaulagaisachin
```

`gnome-extensions info` must print a line `Enabled: Yes`. If it does not,
log out of the GNOME session and back in, run the `enable` command again,
and run `info` again. Do not use Alt+F2 for this first install. That
applies on both X11 and Wayland.

After a later zip, pack and install again, then:

```bash
gnome-extensions disable amd-igpu-monitor@chaulagaisachin
gnome-extensions enable amd-igpu-monitor@chaulagaisachin
```

If the top bar still has no temperature icon and no VRAM segment, and
`XDG_SESSION_TYPE` is `x11`, press Alt+F2, type `r`, and press Enter.
If the session type is `wayland`, log out and back in instead. Do not
press Alt+F2 on Wayland.

## What it reads

| Metric | sysfs source |
|--------|--------------|
| Usage % | `card*/device/gpu_busy_percent` |
| Temperature | `card*/device/hwmon/hwmon*/temp1_input` |
| Power | `card*/device/hwmon/hwmon*/power1_average` |
| Core clock | `card*/device/hwmon/hwmon*/freq1_input` |
| VRAM used/total | `card*/device/mem_info_vram_used` and `mem_info_vram_total` |

The top bar shows icon+usage, icon+temperature, and icon+VRAM
used/total. A missing usage, temperature, or VRAM side is `-` on the
bar. The popup still uses `n/a`.

The AMD card is the first lexicographic `cardN` whose vendor file is
`0x1002`.

## License

GPL-2.0-or-later. See `LICENSE`.

Panel icons are from [Lucide](https://lucide.dev/) (ISC). See
`LICENSE.lucide`. Sources:
[circle-gauge](https://lucide.dev/icons/circle-gauge),
[thermometer](https://lucide.dev/icons/thermometer),
[gpu](https://lucide.dev/icons/gpu).
