// SPDX-License-Identifier: GPL-2.0-or-later
import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Clutter from 'gi://Clutter';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {readGpuInfo, formatVram} from './gpuReader.js';

const REFRESH_SECONDS = 2;

const AmdGpuIndicator = GObject.registerClass(
class AmdGpuIndicator extends PanelMenu.Button {
    _init(extensionPath) {
        super._init(0.0, 'AMD iGPU Monitor', false);

        const box = new St.BoxLayout({style_class: 'panel-status-menu-box'});
        this._icon = new St.Icon({
            gicon: Gio.icon_new_for_string(
                `${extensionPath}/icons/amd-igpu-symbolic.svg`),
            style_class: 'system-status-icon',
        });
        this._panelLabel = new St.Label({
            text: 'GPU …',
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'amd-igpu-panel-label',
        });
        box.add_child(this._icon);
        box.add_child(this._panelLabel);
        this.add_child(box);

        this._rows = {};
        const rowDefs = [
            ['usage', 'GPU usage'],
            ['temp', 'Temperature'],
            ['power', 'Power'],
            ['clock', 'Core clock'],
            ['vram', 'VRAM'],
        ];
        for (const [key, labelText] of rowDefs) {
            const item = new PopupMenu.PopupBaseMenuItem({reactive: false});
            item.add_child(new St.Label({text: labelText, x_expand: true}));
            const value = new St.Label({
                text: 'n/a',
                style_class: 'amd-igpu-value',
            });
            item.add_child(value);
            this.menu.addMenuItem(item);
            this._rows[key] = value;
        }
    }

    update(info) {
        if (info === null) {
            this._panelLabel.text = 'GPU -';
            for (const key of Object.keys(this._rows))
                this._rows[key].text = 'n/a';
            return;
        }

        const pct = info.usage === null ? '-' : `${info.usage}%`;
        const temp = info.tempC === null ? '-' : `${info.tempC}°C`;
        this._panelLabel.text = `${pct} · ${temp}`;

        this._rows.usage.text = info.usage === null ? 'n/a' : `${info.usage}%`;
        this._rows.temp.text = info.tempC === null ? 'n/a' : `${info.tempC} °C`;
        this._rows.power.text = info.powerW === null ? 'n/a' : `${info.powerW.toFixed(1)} W`;
        this._rows.clock.text = info.clockMHz === null ? 'n/a' : `${info.clockMHz} MHz`;
        this._rows.vram.text = (info.vramUsed === null || info.vramTotal === null)
            ? 'n/a'
            : `${formatVram(info.vramUsed)} / ${formatVram(info.vramTotal)}`;
    }
});

export default class AmdIgpuMonitorExtension extends Extension {
    enable() {
        this._indicator = new AmdGpuIndicator(this.path);
        Main.panel.addToStatusArea(this.uuid, this._indicator);

        const tick = () => {
            this._indicator.update(readGpuInfo());
            return GLib.SOURCE_CONTINUE;
        };
        tick();
        this._timeoutId = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT, REFRESH_SECONDS, tick);
    }

    disable() {
        if (this._timeoutId) {
            GLib.source_remove(this._timeoutId);
            this._timeoutId = null;
        }
        this._indicator?.destroy();
        this._indicator = null;
    }
}
