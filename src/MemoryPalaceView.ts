import { ItemView, WorkspaceLeaf, MarkdownRenderer, TFile, Component } from "obsidian";
import * as THREE from "three";
import { CSS3DRenderer, CSS3DObject } from "three/examples/jsm/renderers/CSS3DRenderer.js";
import { parseRoomsFromText, RoomData } from "./RoomParser";
import MemoryPalacePlugin from "./main";

export const MEMORY_PALACE_VIEW = "memory-palace-view";

export class MemoryPalaceView extends ItemView {
    private plugin: MemoryPalacePlugin;

    private renderer!: CSS3DRenderer;
    private scene!: THREE.Scene;
    private camera!: THREE.PerspectiveCamera;
    private targetZ: number = 2000; 
    private targetX: number = 0;

    private targetRotX: number = 0; 
    private targetRotY: number = 0;
    private isDragging: boolean = false;
    
    private wallComponents: Component[] = [];
    private currentFilePath: string = "";
    private isRefreshing: boolean = false;
    private nextFileToRefresh: TFile | null = null;

    constructor(leaf: WorkspaceLeaf, plugin: MemoryPalacePlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType() {
        return MEMORY_PALACE_VIEW;
    }

    getDisplayText() {
        return "Memory Palace 3D";
    }

    async onOpen() {
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();
        
        container.setCssStyles({
            overflow: "hidden",
            backgroundColor: "var(--background-primary)"
        });
        
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, 1, 1, 10000);
        this.camera.position.set(this.targetX, 0, this.targetZ); 

        this.renderer = new CSS3DRenderer();
        
        this.renderer.domElement.setCssStyles({
            pointerEvents: "auto",
            position: "absolute",
            top: "0"
        });
        
        container.appendChild(this.renderer.domElement);

        await this.refresh();

        this.registerEvent(
            this.app.workspace.on("file-open", (file: TFile | null) => {
                if (file && file.extension === "md" && file.path !== this.currentFilePath) {
                    window.setTimeout(() => { // FIX: Compatibilidad con popout
                        this.refresh(file).catch(console.error); // FIX: Captura de promesa
                    }, 50);
                }
            })
        );

        this.registerDomEvent(this.renderer.domElement, "mousedown", (e: MouseEvent) => {
            if (e.target === this.renderer.domElement) {
                this.isDragging = true;
            }
        });

        this.registerDomEvent(window, "mouseup", () => {
            this.isDragging = false;
        });

        this.registerDomEvent(window, "mousemove", (e: MouseEvent) => {
            if (this.isDragging || e.shiftKey) {
                this.targetRotY -= e.movementX * 0.003;
                this.targetRotX -= e.movementY * 0.003;
                
                const pitchLimit = Math.PI / 2.5;
                this.targetRotX = Math.max(-pitchLimit, Math.min(pitchLimit, this.targetRotX));
            }
        });

        this.registerDomEvent(window, "keydown", (e: KeyboardEvent) => {
            const activeEl = window.document.activeElement;
            if (activeEl && (
                activeEl.tagName === "INPUT" || 
                activeEl.tagName === "TEXTAREA" || 
                (activeEl as HTMLElement).isContentEditable
            )) {
                return;
            }

            const step = 150; 
            
            switch (e.code) {
                case "KeyW":
                    this.targetZ -= step;
                    break;
                case "KeyS":
                    this.targetZ += step;
                    if (this.targetZ > 3000) this.targetZ = 3000;
                    break;
                case "KeyA":
                    this.targetX -= step;
                    break;
                case "KeyD":
                    this.targetX += step;
                    break;
                case "KeyQ":
                    this.targetX = 0;       
                    this.targetRotX = 0;    
                    this.targetRotY = 0;    
                    break;
            }
        });

        this.renderer.domElement.addEventListener("wheel", (event) => {
            event.preventDefault();
            this.targetZ -= event.deltaY * 1.5; 
            if (this.targetZ > 3000) this.targetZ = 3000; 
        }, { passive: false });

        const resizeObserver = new ResizeObserver(() => {
            const width = Math.max(1, container.clientWidth);
            const height = Math.max(1, container.clientHeight);
            
            this.camera.aspect = width / height;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(width, height);
        });
        resizeObserver.observe(container);

        this.animate();
    }

    async refresh(file?: TFile) {
        if (this.isRefreshing) {
            if (file) this.nextFileToRefresh = file;
            return;
        }
        this.isRefreshing = true;

        try {
            let fileToLoad = file || this.nextFileToRefresh || this.app.workspace.getActiveFile();
            this.nextFileToRefresh = null;

            while (fileToLoad) {
                for (const comp of this.wallComponents) {
                    this.removeChild(comp);
                }
                this.wallComponents = [];
                this.scene.clear();

                this.targetX = 0;
                this.targetZ = 2000;
                this.targetRotX = 0;
                this.targetRotY = 0;
                this.camera.position.set(this.targetX, 0, this.targetZ);
                this.camera.rotation.set(0, 0, 0);

                this.currentFilePath = fileToLoad.path;
                const content = await this.app.vault.cachedRead(fileToLoad);
                const rooms = parseRoomsFromText(content, this.plugin.settings?.roomDistance || 1000);

                const reversedRooms = [...rooms].reverse();
                for (const [i, room] of reversedRooms.entries()) {
                    await this.buildRoom(room, fileToLoad.path, i);
                }

                fileToLoad = this.nextFileToRefresh;
                this.nextFileToRefresh = null;
            }
        } catch (error) {
            console.error("Error al refrescar el Memory Palace 3D:", error);
        } finally {
            this.isRefreshing = false;
        }
    }

    private bindInteractions(element: HTMLElement, sourcePath: string, hoverParent: HTMLElement) {
        const handleInteraction = (e: Event) => {
            const target = e.target as HTMLElement;
            
            const customTarget = target.closest('[data-target-note]');
            if (customTarget) {
                e.preventDefault();
                e.stopPropagation();
                const notePath = customTarget.getAttribute('data-target-note');
                if (notePath) {
                    this.app.workspace.openLinkText(notePath, sourcePath, false).catch(console.error); // FIX
                    return;
                }
            }

            const clickable = target.closest('.internal-link, .internal-embed');
            if (clickable) {
                e.preventDefault();
                e.stopPropagation();
                let linkText = clickable.getAttribute("data-href") || clickable.getAttribute("href") || clickable.textContent || "";
                if (linkText) {
                    this.app.workspace.openLinkText(linkText.trim(), sourcePath, false).catch(console.error); // FIX
                }
            }
        };

        element.addEventListener("click", handleInteraction, { capture: true });

        element.addEventListener("mouseover", (e) => {
            const target = e.target as HTMLElement;
            
            const customTarget = target.closest('[data-target-note]');
            if (customTarget) {
                const notePath = customTarget.getAttribute('data-target-note');
                if (notePath) {
                    this.app.workspace.trigger("hover-link", {
                        event: e,
                        source: MEMORY_PALACE_VIEW, 
                        hoverParent: hoverParent,
                        targetEl: customTarget,
                        linktext: notePath,
                        sourcePath: sourcePath
                    });
                    return;
                }
            }

            const clickable = target.closest('.internal-link, .internal-embed');
            if (clickable) {
                let linkText = clickable.getAttribute("data-href") || clickable.getAttribute("href") || clickable.textContent || "";
                if (linkText) {
                    this.app.workspace.trigger("hover-link", {
                        event: e,
                        source: MEMORY_PALACE_VIEW, 
                        hoverParent: hoverParent,
                        targetEl: clickable,
                        linktext: linkText.trim(),
                        sourcePath: sourcePath
                    });
                }
            }
        }, { capture: true });
    }

    private async createFloatingContent(markdown: string, sourcePath: string, size: number, x: number, y: number, z: number, roomColor: string) {
        // FIX: Reemplazo de document por activeDocument para compatibilidad con popouts
        const contentDiv = activeDocument.createElement('div');
        contentDiv.className = `mp-wall mp-floating-content`;
        
        contentDiv.setCssStyles({
            width: `${size}px`,
            height: `${size}px`,
            pointerEvents: "none",
            backgroundColor: "transparent",
            boxSizing: "border-box"
        });
        
        const innerDiv = activeDocument.createElement('div'); // FIX
        innerDiv.className = "mp-content";
        
        innerDiv.setCssStyles({
            width: "100%",
            height: "100%",
            fontSize: "2.5em",
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            position: "relative",
            pointerEvents: "none"
        });
        
        innerDiv.addClass("markdown-preview-view", "markdown-rendered");

        let processedMarkdown = await this.resolveBlockEmbeds(markdown, sourcePath);

        const itemRegex = /\[\[([^\]#|]+)(#[^\]|]+)?\]\]\(!?\[\[([^\]]+\.(?:png|jpe?g|gif|svg|webp|bmp))\]\]\)/gi;
        
        // FIX: Tipado estricto en la función de callback del replace
        processedMarkdown = processedMarkdown.replace(itemRegex, (match: string, baseNote?: string, subTarget?: string, imageName?: string) => {
            const base = baseNote?.trim() || "";
            const sub = subTarget?.trim() || "";
            const fullLinkPath = base + sub;
            
            if (!imageName) return match; // Guardia de seguridad TS
            
            const file: TFile | null = this.app.metadataCache.getFirstLinkpathDest(imageName, sourcePath);
            
            if (file) {
                const resourcePath = this.app.vault.getResourcePath(file);
                return `<img src="${resourcePath}" alt="${imageName}|mp-link|${fullLinkPath}" />`;
            }
            return match;
        });

        const imageRegex = /!\[\[([^\]]+\.(png|jpe?g|gif|svg|webp|bmp))\]\]/gi;
        processedMarkdown = processedMarkdown.replace(imageRegex, (match: string, imageName?: string) => {
            if (!imageName) return match; // Guardia de seguridad TS
            
            const file: TFile | null = this.app.metadataCache.getFirstLinkpathDest(imageName, sourcePath);
            if (file) {
                const resourcePath = this.app.vault.getResourcePath(file);
                return `<img src="${resourcePath}" alt="${imageName}" />`;
            }
            return match;
        });
        
        const wallComponent = new Component();
        wallComponent.load();
        
        await MarkdownRenderer.renderMarkdown(processedMarkdown, innerDiv, sourcePath, wallComponent);

        const containers = innerDiv.querySelectorAll('p, .markdown-preview-section, div');
        containers.forEach(child => {
            const el = child as HTMLElement;
            if (el.tagName !== 'IMG' && el.tagName !== 'A') {
                el.setCssStyles({
                    pointerEvents: 'none',
                    display: 'flex',
                    flexWrap: 'wrap',
                    justifyContent: 'center',
                    alignItems: 'center',
                    gap: '20px'
                });
            }
        });

        const interactives = innerDiv.querySelectorAll<HTMLElement>('a.internal-link, a.external-link, .internal-embed');
        interactives.forEach(el => {
            el.setCssStyles({ pointerEvents: 'auto' });
        });

        const allImages = innerDiv.querySelectorAll<HTMLImageElement>('img');
        allImages.forEach(img => {
            img.setCssStyles({
                maxWidth: '45%',
                maxHeight: '75%',
                objectFit: 'contain',
                display: 'inline-block',
                position: 'relative',
                zIndex: '10',
                pointerEvents: 'auto'
            });
            
            const altText = img.getAttribute('alt');
            if (altText && altText.includes('|mp-link|')) {
                const parts = altText.split('|mp-link|');
                img.setAttribute('alt', parts[0] || "");
                img.setAttribute('data-target-note', parts[1] || "");
                img.setCssStyles({ cursor: 'pointer' });
            }
        });

        this.bindInteractions(innerDiv, sourcePath, contentDiv);
        this.addChild(wallComponent); 
        this.wallComponents.push(wallComponent); 
        
        contentDiv.appendChild(innerDiv);

        const object = new CSS3DObject(contentDiv);
        object.position.set(x, y, z); 
        this.scene.add(object);
    }

    private async buildRoom(room: RoomData, sourcePath: string, roomIndex: number) {
        const size = 1000; 
        const z = room.zOffset * 2.5; 

        const hue = (roomIndex * 137.5) % 360;
        const randomBgColor = `hsl(${hue}, 40%, 15%)`;
        const bgColor = room.color ? room.color : randomBgColor;

        if (room.customTitle) {
            const titleDiv = activeDocument.createElement('div'); // FIX
            titleDiv.className = 'mp-room-title';
            
            titleDiv.setCssStyles({
                fontSize: '8em',
                fontWeight: 'bold',
                color: 'var(--text-normal)',
                textShadow: '0px 4px 10px rgba(0,0,0,0.8)',
                pointerEvents: 'auto',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                textAlign: 'center'
            });

            const titleComponent = new Component();
            titleComponent.load();
            
            await MarkdownRenderer.renderMarkdown(room.customTitle, titleDiv, sourcePath, titleComponent);
            this.addChild(titleComponent);
            this.wallComponents.push(titleComponent);

            this.bindInteractions(titleDiv, sourcePath, titleDiv);
            
            const titleObj = new CSS3DObject(titleDiv);
            titleObj.position.set(0, size / 2 + 150, z + size * 0.8);
            this.scene.add(titleObj);
        }

        if (room.front && room.front.trim() !== "" && room.front.trim().toLowerCase() !== "vacío") {
            await this.createWall(room.front, sourcePath, size, 0, 0, z + size / 2, 0, 0, 0, 'front', bgColor);
        }

        if (room.back && room.back.trim() !== "" && room.back.trim().toLowerCase() !== "vacío") {
            await this.createWall(room.back, sourcePath, size, 0, 0, z - size / 2, 0, 0, 0, 'back', bgColor);
        }

        await this.createWall(room.up, sourcePath, size, 0, size/2, z, Math.PI / 2, 0, 0, 'top', bgColor);       
        await this.createWall(room.down, sourcePath, size, 0, -size/2, z, -Math.PI / 2, 0, 0, 'bottom', bgColor);    
        await this.createWall(room.left, sourcePath, size, -size/2, 0, z, 0, Math.PI / 2, 0, 'left', bgColor);     
        await this.createWall(room.right, sourcePath, size, size/2, 0, z, 0, -Math.PI / 2, 0, 'right', bgColor);    

        if (room.content && room.content.trim() !== "") {
            await this.createFloatingContent(room.content, sourcePath, size, 0, 0, z, room.color || bgColor);
        }
    }

    private async resolveBlockEmbeds(text: string, sourcePath: string): Promise<string> {
        const blockEmbedRegex = /!\[\[([^#\]|]+)#\^([a-zA-Z0-9-]+)\]\]/g;
        let processedText = text;
        
        const matches = Array.from(text.matchAll(blockEmbedRegex));
        
        for (const match of matches) {
            const fullMatch = match[0];
            const linkPath = match[1];
            const blockId = match[2];
            
            if (!fullMatch || !linkPath || !blockId) continue;
            
            let targetFile = this.app.metadataCache.getFirstLinkpathDest(linkPath.trim(), sourcePath);
            
            if (!targetFile) {
                const cleanPath = linkPath.trim();
                const abstractFile = this.app.vault.getAbstractFileByPath(cleanPath) 
                                  || this.app.vault.getAbstractFileByPath(cleanPath + ".md");
                if (abstractFile instanceof TFile) {
                    targetFile = abstractFile;
                }
            }

            if (targetFile instanceof TFile) {
                const cache = this.app.metadataCache.getFileCache(targetFile);
                const blocks = cache?.blocks;
                const blockData = blocks ? (blocks[blockId.toLowerCase()] || blocks[blockId]) : null;
                
                let extractedText = "";

                if (blockData) {
                    const content = await this.app.vault.read(targetFile);
                    const startOffset = blockData.position?.start?.offset;
                    const endOffset = blockData.position?.end?.offset;
                    
                    if (typeof startOffset === 'number' && typeof endOffset === 'number') {
                        extractedText = content.substring(startOffset, endOffset);
                    }
                } else {
                    const content = await this.app.vault.read(targetFile);
                    const lines = content.split("\n");
                    const targetLine = lines.find(l => l.includes(`^${blockId}`));
                    if (targetLine) extractedText = targetLine;
                }

                if (extractedText) {
                    let cleanText = extractedText.replace(new RegExp(`\\^${blockId}`, "gi"), "");
                    cleanText = cleanText.replace(/\[!zotflow-[^\]]+\]/gi, "");
                    cleanText = cleanText.replace(/>/g, "").trim();
                    
                    processedText = processedText.replace(fullMatch, cleanText);
                }
            }
        }
        return processedText;
    }

    private async createWall(markdown: string, sourcePath: string, size: number, x: number, y: number, z: number, rotX: number, rotY: number, rotZ: number, side: string, bgColor: string) {
        const wallDiv = activeDocument.createElement('div'); // FIX
        wallDiv.className = `mp-wall mp-wall-${side}`;
        
        wallDiv.setCssStyles({
            width: `${size}px`,
            height: `${size}px`,
            pointerEvents: "none",
            backgroundColor: bgColor,
            border: "2px solid rgba(255, 255, 255, 0.1)",
            boxSizing: "border-box"
        });
        
        const contentDiv = activeDocument.createElement('div'); // FIX
        contentDiv.className = "mp-content";
        
        contentDiv.setCssStyles({
            width: "100%",
            height: "100%",
            fontSize: "2.5em",
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            position: "relative",
            pointerEvents: "none"
        });
        
        contentDiv.addClass("markdown-preview-view", "markdown-rendered");

        let processedMarkdown = await this.resolveBlockEmbeds(markdown, sourcePath);

        const itemRegex = /\[\[([^\]#|]+)(#[^\]|]+)?\]\]\(!?\[\[([^\]]+\.(?:png|jpe?g|gif|svg|webp|bmp))\]\]\)/gi;
        
        // FIX: Tipado estricto
        processedMarkdown = processedMarkdown.replace(itemRegex, (match: string, baseNote?: string, subTarget?: string, imageName?: string) => {
            const base = baseNote?.trim() || "";
            const sub = subTarget?.trim() || "";
            const fullLinkPath = base + sub;
            
            if (!imageName) return match; 
            
            const file: TFile | null = this.app.metadataCache.getFirstLinkpathDest(imageName, sourcePath);
            
            if (file) {
                const resourcePath = this.app.vault.getResourcePath(file);
                return `<img src="${resourcePath}" alt="${imageName}|mp-link|${fullLinkPath}" />`;
            }
            return match;
        });

        const imageRegex = /!\[\[([^\]]+\.(png|jpe?g|gif|svg|webp|bmp))\]\]/gi;
        processedMarkdown = processedMarkdown.replace(imageRegex, (match: string, imageName?: string) => {
            if (!imageName) return match;
            
            const file: TFile | null = this.app.metadataCache.getFirstLinkpathDest(imageName, sourcePath);
            if (file) {
                const resourcePath = this.app.vault.getResourcePath(file);
                return `<img src="${resourcePath}" alt="${imageName}" />`;
            }
            return match;
        });

        const wallComponent = new Component();
        wallComponent.load();
        
        await MarkdownRenderer.renderMarkdown(processedMarkdown, contentDiv, sourcePath, wallComponent);
        
        const useFullSpace = this.plugin.settings?.fullSpaceImages ?? false;

        const containers = contentDiv.querySelectorAll('p, .markdown-preview-section, div');
        containers.forEach(child => {
            const el = child as HTMLElement;
            if (el.tagName !== 'IMG' && el.tagName !== 'A') {
                // FIX: Uso directo y seguro sin casteos problemáticos
                const styles: Partial<CSSStyleDeclaration> = { pointerEvents: 'none' };
                if (!useFullSpace) {
                    styles.display = 'flex';
                    styles.flexWrap = 'wrap';
                    styles.justifyContent = 'center';
                    styles.alignItems = 'center';
                    styles.gap = '20px';
                }
                el.setCssStyles(styles);
            }
        });

        const interactives = contentDiv.querySelectorAll<HTMLElement>('a.internal-link, a.external-link, .internal-embed');
        interactives.forEach(el => {
            el.setCssStyles({
                pointerEvents: 'auto',
                position: 'relative',
                zIndex: '10'
            });
        });

        const allImages = contentDiv.querySelectorAll<HTMLImageElement>('img');
        allImages.forEach(img => {
            if (useFullSpace) {
                img.setCssStyles({
                    position: 'absolute',
                    top: '0',
                    left: '0',
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    zIndex: '0',
                    pointerEvents: 'auto'
                });
            } else {
                img.setCssStyles({
                    maxWidth: '45%',
                    maxHeight: '45%',
                    objectFit: 'contain',
                    display: 'inline-block',
                    position: 'relative',
                    zIndex: '10',
                    pointerEvents: 'auto'
                });
            }

            const altText = img.getAttribute('alt');
            if (altText && altText.includes('|mp-link|')) {
                const parts = altText.split('|mp-link|');
                img.setAttribute('alt', parts[0] || "");
                img.setAttribute('data-target-note', parts[1] || "");
                img.setCssStyles({ cursor: 'pointer' });
            }
        });

        if (useFullSpace) {
            contentDiv.setCssStyles({ zIndex: "1" });
        }

        this.bindInteractions(contentDiv, sourcePath, wallDiv);
        this.addChild(wallComponent); 
        this.wallComponents.push(wallComponent); 
        
        wallDiv.appendChild(contentDiv);

        const object = new CSS3DObject(wallDiv);
        object.position.set(x, y, z);
        object.rotation.set(rotX, rotY, rotZ);
        this.scene.add(object);
    }

    private animate = () => {
        window.requestAnimationFrame(this.animate); // FIX: Compatibilidad con popout
        
        this.camera.position.x += (this.targetX - this.camera.position.x) * 0.1;
        this.camera.position.z += (this.targetZ - this.camera.position.z) * 0.1;
        
        this.camera.rotation.x += (this.targetRotX - this.camera.rotation.x) * 0.1;
        this.camera.rotation.y += (this.targetRotY - this.camera.rotation.y) * 0.1;

        this.renderer.render(this.scene, this.camera);
    }

    async onClose() {
        for (const comp of this.wallComponents) {
            this.removeChild(comp);
        }
        this.wallComponents = [];
        this.scene.clear();
    }
}