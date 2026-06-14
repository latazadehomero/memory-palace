import { App, PluginSettingTab, Setting } from 'obsidian';
import MemoryPalacePlugin from './main';

export interface MemoryPalaceSettings {
    roomDistance: number;
    fullSpaceImages: boolean;
}

export const DEFAULT_SETTINGS: MemoryPalaceSettings = {
    roomDistance: 1000,
    fullSpaceImages: false
}

export class MemoryPalaceSettingTab extends PluginSettingTab {
    plugin: MemoryPalacePlugin;

    constructor(app: App, plugin: MemoryPalacePlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        new Setting(containerEl)
            .setName('Distance between rooms')
            .setDesc('Defines the separation on the Z axis between each level (default: 1000)')
            .addText(text => text
                .setPlaceholder('1000')
                .setValue(this.plugin.settings?.roomDistance?.toString() || '1000')
                .onChange(async (value) => {
                    const parsed = parseInt(value, 10);
                    if (!isNaN(parsed)) {
                        this.plugin.settings.roomDistance = parsed;
                        await this.plugin.saveSettings();
                    }
                }));

        new Setting(containerEl)
            .setName('Full wall images')
            .setDesc("If enabled, embedded images will occupy 100% of the room's face, acting as a background.")
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings?.fullSpaceImages || false)
                .onChange(async (value) => {
                    this.plugin.settings.fullSpaceImages = value;
                    await this.plugin.saveSettings();
                }));
    }
}