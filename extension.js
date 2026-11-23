// SPDX-License-Identifier: GPL-2.0-or-later
import St from 'gi://St';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {readGpuInfo, formatVram, formatPanelParts} from './gpuReader.js';

const REFRESH_SECONDS = 2;

// Bundled Lucide icons as GNOME -symbolic SVGs (ISC; see LICENSE.lucide).
const USAGE_ICON_FILE = 'circle-gauge-symbolic.svg';
const TEMP_ICON_FILE = 'thermometer-symbolic.svg';
const VRAM_ICON_FILE = 'gpu-symbolic.svg';

function _panelIcon(extensionPath, fileName, {groupStart = false} = {}) {
    const file = Gio.File.new_for_path(
        GLib.build_filenamev([extensionPath, 'icons', fileName]));
    const styleClass = groupStart
        ? 'system-status-icon amd-igpu-panel-icon amd-igpu-metric-group'
        : 'system-status-icon amd-igpu-panel-icon';
    return new St.Icon({
        gicon: new Gio.FileIcon({file}),
        style_class: styleClass,
        icon_size: 16,
        y_align: Clutter.ActorAlign.CENTER,
    });
}

function _hardenPanelLabel(label) {
    const ct = label.clutter_text;
    // St.Label constructs Clutter.Text with ellipsize=END. AT-SPI still
    // exposes the full string while paint shows "…". Keep NONE stuck
    // across style refreshes that can restore END.
    ct.set_ellipsize(Pango.EllipsizeMode.NONE);
    ct.set_line_wrap(false);
    ct.set_width(-1);
    label.set_width(-1);
}

function _panelLabel(text = '') {
    const label = new St.Label({
        text,
        y_align: Clutter.ActorAlign.CENTER,
        x_align: Clutter.ActorAlign.START,
        style_class: 'amd-igpu-panel-label',
    });
    _hardenPanelLabel(label);
    label.connect('style-changed', () => _hardenPanelLabel(label));
    return label;
}

const AmdGpuIndicator = GObject.registerClass(
class AmdGpuIndicator extends PanelMenu.Button {
    _init(extensionPath) {
        super._init(0.0, 'AMD iGPU Monitor', false);

        // spacing: 0 via .amd-igpu-panel-box — theme panel-status-menu-box
        // spacing (~6px) was inflating the usage icon→value gap.
        const box = new St.BoxLayout({
            style_class: 'panel-status-menu-box amd-igpu-panel-box',
        });
        // Usage icon stays visible even in the empty state (GPU - / GPU …).
        this._usageIcon = _panelIcon(extensionPath, USAGE_ICON_FILE);
        // Metrics show/hide as one box so PanelMenu.Button preferred width
        // tracks the full line (not the empty-state "GPU …" width).
        // Layout: icon+usage  icon+temp  icon+vram (icons separate groups).
        this._metricsBox = new St.BoxLayout({
            style_class: 'panel-status-menu-box amd-igpu-panel-box amd-igpu-metrics-box',
        });
        this._usageLabel = _panelLabel();
        this._tempIcon = _panelIcon(extensionPath, TEMP_ICON_FILE, {groupStart: true});
        this._tempLabel = _panelLabel();
        this._vramIcon = _panelIcon(extensionPath, VRAM_ICON_FILE, {groupStart: true});
        this._vramLabel = _panelLabel();
        this._emptyLabel = _panelLabel('GPU …');

        this._metricsBox.add_child(this._usageLabel);
        this._metricsBox.add_child(this._tempIcon);
        this._metricsBox.add_child(this._tempLabel);
        this._metricsBox.add_child(this._vramIcon);
        this._metricsBox.add_child(this._vramLabel);

        box.add_child(this._usageIcon);
        box.add_child(this._metricsBox);
        box.add_child(this._emptyLabel);
        this.add_child(box);

        this._metricsBox.hide();

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
            value.clutter_text.set_ellipsize(Pango.EllipsizeMode.NONE);
            value.clutter_text.set_line_wrap(false);
            item.add_child(value);
            this.menu.addMenuItem(item);
            this._rows[key] = value;
        }
    }

    _setPanelText(label, text) {
        if (label.text !== text)
            label.text = text;
        // Never set_width(preferred): that locked a short min/nat width so
        // paint ellipsized even when accessibility already had full GiB.
        _hardenPanelLabel(label);
        label.queue_relayout();
    }

    _showMetrics() {
        this._metricsBox.show();
        this._emptyLabel.hide();
        this.queue_relayout();
    }

    _showEmpty(text) {
        this._metricsBox.hide();
        this._setPanelText(this._emptyLabel, text);
        this._emptyLabel.show();
        this.queue_relayout();
    }

    update(info) {
        if (info === null) {
            this._showEmpty('GPU -');
            for (const key of Object.keys(this._rows))
                this._rows[key].text = 'n/a';
            return;
        }

        // vramTotal is re-read from mem_info_vram_total every tick via
        // readGpuInfo(); each natural-width label grows/shrinks with that string.
        const parts = formatPanelParts(info);
        this._setPanelText(this._usageLabel, parts.usage);
        this._setPanelText(this._tempLabel, parts.temp);
        this._setPanelText(this._vramLabel, parts.vram);
        this._showMetrics();

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
            readGpuInfo()
                .then(info => this._indicator?.update(info))
                .catch(() => this._indicator?.update(null));
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
