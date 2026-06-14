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

        this.addRibbonIcon('box', 'Abrir Memory Palace 3D', () => {
            this.activateView();
        });

        this.addCommand({
            id: 'open-memory-palace',
            name: 'Open Memory Palace 3D',
            callback: () => {
                this.activateView();
            }
        });

        this.addCommand({
            id: 'insert-memory-palace-room',
            name: 'Insert Room Template',
            editorCallback: (editor, view) => {
                const template = `\n## Room : \n- up: \n- down: \n- left: \n- right: \n`;
                editor.replaceSelection(template);
            }
        });

        this.addCommand({
            id: 'refresh-memory-palace-view',
            name: 'Refresh Memory Palace 3D',
            callback: () => {
                const leaves = this.app.workspace.getLeavesOfType(MEMORY_PALACE_VIEW);
                const view = leaves[0]?.view as MemoryPalaceView | undefined;
                if (view) {
                    view.refresh();
                }
            }
        });
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
        
        // Disparar refresco automático al cambiar configuraciones
        const leaves = this.app.workspace.getLeavesOfType(MEMORY_PALACE_VIEW);
        const view = leaves[0]?.view as MemoryPalaceView | undefined;
        if (view) {
            view.refresh();
        }
    }

    async activateView() {
        const { workspace } = this.app;
        
        let leaf: WorkspaceLeaf | null = null;
        const leaves = workspace.getLeavesOfType(MEMORY_PALACE_VIEW);
        
        if (leaves.length > 0) {
            leaf = leaves[0] ?? null;
        } else {
            // FIX: Volvemos al método correcto de la API y manejamos la nulidad estricta
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