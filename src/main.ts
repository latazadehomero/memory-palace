import { Plugin, WorkspaceLeaf } from 'obsidian';
import { MemoryPalaceView, MEMORY_PALACE_VIEW } from './MemoryPalaceView';
import { MemoryPalaceSettings, DEFAULT_SETTINGS, MemoryPalaceSettingTab } from './settings';

export default class MemoryPalacePlugin extends Plugin {
    settings!: MemoryPalaceSettings;

    async onload() {
        await this.loadSettings();

        this.registerView(
            MEMORY_PALACE_VIEW,
            (leaf) => new MemoryPalaceView(leaf, this)
        );

        this.addSettingTab(new MemoryPalaceSettingTab(this.app, this));

        this.addRibbonIcon('box', 'Open 3D View', () => {
            this.activateView().catch(console.error); // FIX: Promesa manejada
        });

        this.addCommand({
            id: 'open-view', // FIX: Removido el prefijo del ID
            name: 'Open View', // FIX: Removido el nombre redundante
            callback: () => {
                this.activateView().catch(console.error); // FIX: Promesa manejada
            }
        });

        this.addCommand({
            id: 'insert-room-template', // FIX: Removido el prefijo
            name: 'Insert Room Template', // FIX: Removido el nombre redundante
            editorCallback: (editor, view) => {
                const template = `\n## Room : \n- up: \n- down: \n- left: \n- right: \n`;
                editor.replaceSelection(template);
            }
        });

        this.addCommand({
            id: 'refresh-view', // FIX: Removido el prefijo
            name: 'Refresh View', // FIX: Removido el nombre redundante
            callback: () => {
                const leaves = this.app.workspace.getLeavesOfType(MEMORY_PALACE_VIEW);
                const view = leaves[0]?.view as MemoryPalaceView | undefined;
                if (view) {
                    view.refresh().catch(console.error); // FIX: Promesa manejada
                }
            }
        });
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
        
        const leaves = this.app.workspace.getLeavesOfType(MEMORY_PALACE_VIEW);
        const view = leaves[0]?.view as MemoryPalaceView | undefined;
        if (view) {
            view.refresh().catch(console.error); // FIX: Promesa manejada
        }
    }

    async activateView() {
        const { workspace } = this.app;
        
        let leaf: WorkspaceLeaf | null = null;
        const leaves = workspace.getLeavesOfType(MEMORY_PALACE_VIEW);
        
        if (leaves.length > 0) {
            leaf = leaves[0] ?? null;
        } else {
            leaf = workspace.getRightLeaf(false) ?? null;
            
            if (leaf) {
                await leaf.setViewState({ type: MEMORY_PALACE_VIEW, active: true });
            }
        }

        if (leaf) {
            workspace.revealLeaf(leaf);
        }
    }
}