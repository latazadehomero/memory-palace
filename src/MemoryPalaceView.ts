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

    // --- NUEVAS PROPIEDADES DE CÁMARA ---
    private targetRotX: number = 0; 
    private targetRotY: number = 0;
    private isDragging: boolean = false;
    // ------------------------------------
    
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
        container.style.overflow = "hidden";
        container.style.backgroundColor = "var(--background-primary)";
        
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, 1, 1, 10000);
        this.camera.position.set(this.targetX, 0, this.targetZ); 

        this.renderer = new CSS3DRenderer();
        this.renderer.domElement.style.pointerEvents = "auto"; 
        this.renderer.domElement.style.position = "absolute";
        this.renderer.domElement.style.top = "0";
        
        container.appendChild(this.renderer.domElement);

        await this.refresh();

        this.registerEvent(
            this.app.workspace.on("file-open", (file: TFile | null) => {
                if (file && file.extension === "md" && file.path !== this.currentFilePath) {
                    setTimeout(() => {
                        this.refresh(file);
                    }, 50);
                }
            })
        );

        // --- SISTEMA DE ROTACIÓN Y RATÓN ---
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

        // --- NUEVO: SISTEMA DE CONTROLES POR TECLADO (WASD + Q) ---
        this.registerDomEvent(window, "keydown", (e: KeyboardEvent) => {
            const activeEl = window.document.activeElement;
            // TS Estricto + Guard: Evita disparar el movimiento si el usuario está escribiendo en Obsidian
            if (activeEl && (
                activeEl.tagName === "INPUT" || 
                activeEl.tagName === "TEXTAREA" || 
                (activeEl as HTMLElement).isContentEditable
            )) {
                return;
            }

            const step = 150; // Sensibilidad/velocidad del movimiento por pulsación
            
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
                    // FIX: Centrado de cámara relativo (solo endereza y centra en X)
                    this.targetX = 0;       // Vuelve al centro del meridiano horizontal
                    this.targetRotX = 0;    // Endereza la vista hacia arriba/abajo
                    this.targetRotY = 0;    // Endereza la vista hacia la izquierda/derecha
                    // Se elimina this.targetZ para que permanezcas en la sala en la que estás
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

                // FIX: Reseteo completo incluyendo el nuevo eje horizontal targetX
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
                    this.app.workspace.openLinkText(notePath, sourcePath, false);
                    return;
                }
            }

            const clickable = target.closest('.internal-link, .internal-embed');
            if (clickable) {
                e.preventDefault();
                e.stopPropagation();
                let linkText = clickable.getAttribute("data-href") || clickable.getAttribute("href") || clickable.textContent || "";
                if (linkText) {
                    this.app.workspace.openLinkText(linkText.trim(), sourcePath, false); 
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
        const contentDiv = document.createElement('div');
        contentDiv.className = `mp-wall mp-floating-content`;
        contentDiv.style.width = `${size}px`;
        contentDiv.style.height = `${size}px`;
        
        // 🔴 FIX CRÍTICO: La caja principal 1000x1000 es 100% fantasmal (no bloquea clics)
        contentDiv.style.pointerEvents = "none"; 
        
        contentDiv.style.backgroundColor = "transparent";
        contentDiv.style.boxSizing = "border-box";
        
        const innerDiv = document.createElement('div');
        innerDiv.className = "mp-content";
        innerDiv.style.width = "100%";
        innerDiv.style.height = "100%"; 
        innerDiv.style.fontSize = "2.5em";
        innerDiv.style.textAlign = "center";
        
        innerDiv.style.display = "flex";
        innerDiv.style.flexDirection = "column"; 
        innerDiv.style.justifyContent = "center"; 
        innerDiv.style.alignItems = "center"; 
        innerDiv.style.position = "relative";
        
        // 🔴 El contenedor de contenido también debe ser fantasmal
        innerDiv.style.pointerEvents = "none";
        
        innerDiv.addClass("markdown-preview-view", "markdown-rendered");

        let processedMarkdown = await this.resolveBlockEmbeds(markdown, sourcePath);

        const itemRegex = /\[\[([^\]#|]+)(#[^\]|]+)?\]\]\(!?\[\[([^\]]+\.(?:png|jpe?g|gif|svg|webp|bmp))\]\]\)/gi;
        
        processedMarkdown = processedMarkdown.replace(itemRegex, (match, baseNote, subTarget, imageName) => {
            const base = baseNote?.trim() || "";
            const sub = subTarget?.trim() || "";
            const fullLinkPath = base + sub;
            const file: TFile | null = this.app.metadataCache.getFirstLinkpathDest(imageName, sourcePath);
            
            if (file) {
                const resourcePath = this.app.vault.getResourcePath(file);
                return `<img src="${resourcePath}" alt="${imageName}|mp-link|${fullLinkPath}" />`;
            }
            return match;
        });

        const imageRegex = /!\[\[([^\]]+\.(png|jpe?g|gif|svg|webp|bmp))\]\]/gi;
        
        processedMarkdown = processedMarkdown.replace(imageRegex, (match, imageName) => {
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

        // --- DOM FIX: Alinear múltiples imágenes y reparar hitboxes ---
        
        const containers = innerDiv.querySelectorAll('p, .markdown-preview-section, div');
        containers.forEach(child => {
            const el = child as HTMLElement;
            // Quitamos la colisión a los contenedores pero los convertimos en Flex para alinear múltiples imágenes
            if (el.tagName !== 'IMG' && el.tagName !== 'A') {
                el.style.pointerEvents = 'none'; 
                el.style.display = 'flex';
                el.style.flexWrap = 'wrap';
                el.style.justifyContent = 'center';
                el.style.alignItems = 'center';
                el.style.gap = '20px'; 
            }
        });

        const interactives = innerDiv.querySelectorAll<HTMLElement>('a.internal-link, a.external-link, .internal-embed');
        interactives.forEach(el => {
            el.style.pointerEvents = 'auto'; // Solo el enlace captura el clic
        });

        const allImages = innerDiv.querySelectorAll<HTMLImageElement>('img');
        allImages.forEach(img => {
            img.style.maxWidth = '45%';
            img.style.maxHeight = '75%';
            img.style.objectFit = 'contain';
            img.style.display = 'inline-block';
            img.style.position = 'relative'; 
            img.style.zIndex = '10'; 
            
            // 🟢 CRÍTICO: Recuperamos la interacción SOLAMENTE en los píxeles de la imagen
            img.style.pointerEvents = 'auto'; 
            
            const altText = img.getAttribute('alt');
            if (altText && altText.includes('|mp-link|')) {
                const parts = altText.split('|mp-link|');
                img.setAttribute('alt', parts[0] || "");
                img.setAttribute('data-target-note', parts[1] || "");
                img.style.cursor = 'pointer';
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
            const titleDiv = document.createElement('div');
            titleDiv.className = 'mp-room-title';
            
            titleDiv.style.fontSize = '8em';
            titleDiv.style.fontWeight = 'bold';
            titleDiv.style.color = 'var(--text-normal)';
            titleDiv.style.textShadow = '0px 4px 10px rgba(0,0,0,0.8)';
            titleDiv.style.pointerEvents = 'auto'; 
            
            titleDiv.style.display = 'flex';
            titleDiv.style.justifyContent = 'center';
            titleDiv.style.alignItems = 'center';
            titleDiv.style.textAlign = 'center';

            const titleComponent = new Component();
            titleComponent.load();
            
            await MarkdownRenderer.renderMarkdown(room.customTitle, titleDiv, sourcePath, titleComponent);
            this.addChild(titleComponent);
            this.wallComponents.push(titleComponent);

            this.bindInteractions(titleDiv, sourcePath, titleDiv);
            
            // Ajustamos el título flotante un poco más al frente
            const titleObj = new CSS3DObject(titleDiv);
            titleObj.position.set(0, size / 2 + 150, z + size * 0.8);
            this.scene.add(titleObj);
        }

        // --- VISUALIZACIÓN DE PARED FRONTAL OPTIMIZADA ---
        // FIX: Se coloca exactamente a size/2 para formar un cubo perfecto y no invadir la Room anterior.
        if (room.front && room.front.trim() !== "" && room.front.trim().toLowerCase() !== "vacío") {
            await this.createWall(room.front, sourcePath, size, 0, 0, z + size / 2, 0, 0, 0, 'front', bgColor);
        }

        // --- VISUALIZACIÓN DE PARED TRASERA (BACK) ---
        // Se mantiene en el fondo del cubo (z - size / 2)
        if (room.back && room.back.trim() !== "" && room.back.trim().toLowerCase() !== "vacío") {
            await this.createWall(room.back, sourcePath, size, 0, 0, z - size / 2, 0, 0, 0, 'back', bgColor);
        }

        // --- PAREDES PERMANENTES INTERIORES ---
        await this.createWall(room.up, sourcePath, size, 0, size/2, z, Math.PI / 2, 0, 0, 'top', bgColor);       
        await this.createWall(room.down, sourcePath, size, 0, -size/2, z, -Math.PI / 2, 0, 0, 'bottom', bgColor);    
        await this.createWall(room.left, sourcePath, size, -size/2, 0, z, 0, Math.PI / 2, 0, 'left', bgColor);     
        await this.createWall(room.right, sourcePath, size, size/2, 0, z, 0, -Math.PI / 2, 0, 'right', bgColor);    

        // --- VISUALIZACIÓN DEL OBJETO CENTRAL FLOTANTE (CONTENT) ---
        // FIX: Al tener un cubo geométricamente perfecto, el centro exacto del mismo vuelve a ser simplemente "z".
        if (room.content && room.content.trim() !== "") {
            await this.createFloatingContent(room.content, sourcePath, size, 0, 0, z, room.color || bgColor);
        }
    }


    // --- NUEVO MÉTODO AÑADIDO AQUÍ ---
    private async resolveBlockEmbeds(text: string, sourcePath: string): Promise<string> {
        // Regex para capturar transclusiones de bloques: ![[Archivo#^ID-bloque]]
        const blockEmbedRegex = /!\[\[([^#\]|]+)#\^([a-zA-Z0-9-]+)\]\]/g;
        let processedText = text;
        
        const matches = Array.from(text.matchAll(blockEmbedRegex));
        
        for (const match of matches) {
            const fullMatch = match[0];
            const linkPath = match[1];
            const blockId = match[2];
            
            if (!fullMatch || !linkPath || !blockId) continue;
            
            // 1. Intentamos resolver el archivo en el path de Obsidian
            let targetFile = this.app.metadataCache.getFirstLinkpathDest(linkPath.trim(), sourcePath);
            
            // Fallback si no se encontró con getFirstLinkpathDest
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

                // 2. Extraer el contenido del bloque
                if (blockData) {
                    const content = await this.app.vault.read(targetFile);
                    const startOffset = blockData.position?.start?.offset;
                    const endOffset = blockData.position?.end?.offset;
                    
                    // Comprobación de nulidad para modo estricto
                    if (typeof startOffset === 'number' && typeof endOffset === 'number') {
                        extractedText = content.substring(startOffset, endOffset);
                    }
                } else {
                    // Fallback escaneando líneas si la caché falló
                    const content = await this.app.vault.read(targetFile);
                    const lines = content.split("\n");
                    const targetLine = lines.find(l => l.includes(`^${blockId}`));
                    if (targetLine) extractedText = targetLine;
                }

                // 3. Limpiar y reemplazar
                if (extractedText) {
                    // Quitamos el ID del bloque del render final
                    let cleanText = extractedText.replace(new RegExp(`\\^${blockId}`, "gi"), "");
                    // Removemos etiquetas de metadata propias de Zotflow
                    cleanText = cleanText.replace(/\[!zotflow-[^\]]+\]/gi, "");
                    // Limpiamos blockquotes innecesarios
                    cleanText = cleanText.replace(/>/g, "").trim();
                    
                    processedText = processedText.replace(fullMatch, cleanText);
                }
            }
        }
        return processedText;
        
    }
    // --- FIN DEL NUEVO MÉTODO ---
    

    private async createWall(markdown: string, sourcePath: string, size: number, x: number, y: number, z: number, rotX: number, rotY: number, rotZ: number, side: string, bgColor: string) {
        const wallDiv = document.createElement('div');
        wallDiv.className = `mp-wall mp-wall-${side}`;
        wallDiv.style.width = `${size}px`;
        wallDiv.style.height = `${size}px`;
        
        // 🔴 FIX CRÍTICO: La pared física NO atrapa clicks. El color de fondo se verá, 
        // pero dejará pasar el raycast para que puedas apuntar libremente a los elementos en el 3D.
        wallDiv.style.pointerEvents = "none"; 
        
        wallDiv.style.backgroundColor = bgColor;
        wallDiv.style.border = "2px solid rgba(255, 255, 255, 0.1)";
        wallDiv.style.boxSizing = "border-box";
        
        const contentDiv = document.createElement('div');
        contentDiv.className = "mp-content";
        contentDiv.style.width = "100%";
        contentDiv.style.height = "100%"; 
        contentDiv.style.fontSize = "2.5em";
        contentDiv.style.textAlign = "center";
        
        contentDiv.style.display = "flex";
        contentDiv.style.flexDirection = "column"; 
        contentDiv.style.justifyContent = "center"; 
        contentDiv.style.alignItems = "center"; 
        contentDiv.style.position = "relative";
        
        // 🔴 Contenedor interno también en none
        contentDiv.style.pointerEvents = "none"; 
        
        contentDiv.addClass("markdown-preview-view", "markdown-rendered");

        let processedMarkdown = await this.resolveBlockEmbeds(markdown, sourcePath);

        const itemRegex = /\[\[([^\]#|]+)(#[^\]|]+)?\]\]\(!?\[\[([^\]]+\.(?:png|jpe?g|gif|svg|webp|bmp))\]\]\)/gi;
        
        processedMarkdown = processedMarkdown.replace(itemRegex, (match, baseNote, subTarget, imageName) => {
            const base = baseNote?.trim() || "";
            const sub = subTarget?.trim() || "";
            const fullLinkPath = base + sub;
            const file: TFile | null = this.app.metadataCache.getFirstLinkpathDest(imageName, sourcePath);
            
            if (file) {
                const resourcePath = this.app.vault.getResourcePath(file);
                return `<img src="${resourcePath}" alt="${imageName}|mp-link|${fullLinkPath}" />`;
            }
            return match;
        });

        const imageRegex = /!\[\[([^\]]+\.(png|jpe?g|gif|svg|webp|bmp))\]\]/gi;
        
        processedMarkdown = processedMarkdown.replace(imageRegex, (match, imageName) => {
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
        
        // --- DOM FIX: Estructura anti-colisiones de Obsidian ---
        const useFullSpace = this.plugin.settings?.fullSpaceImages ?? false;

        const containers = contentDiv.querySelectorAll('p, .markdown-preview-section, div');
        containers.forEach(child => {
            const el = child as HTMLElement;
            if (el.tagName !== 'IMG' && el.tagName !== 'A') {
                el.style.pointerEvents = 'none'; // Desactivar cajas invisibles
                if (!useFullSpace) {
                    el.style.display = 'flex';
                    el.style.flexWrap = 'wrap';
                    el.style.justifyContent = 'center';
                    el.style.alignItems = 'center';
                    el.style.gap = '20px'; // Separar visualmente múltiples imágenes 
                }
            }
        });

        const interactives = contentDiv.querySelectorAll<HTMLElement>('a.internal-link, a.external-link, .internal-embed');
        interactives.forEach(el => {
            el.style.pointerEvents = 'auto';
            el.style.position = 'relative';
            el.style.zIndex = '10';
        });

        const allImages = contentDiv.querySelectorAll<HTMLImageElement>('img');
        allImages.forEach(img => {
            if (useFullSpace) {
                img.style.position = 'absolute';
                img.style.top = '0';
                img.style.left = '0';
                img.style.width = '100%';
                img.style.height = '100%';
                img.style.objectFit = 'cover';
                img.style.zIndex = '0';
                img.style.pointerEvents = 'auto'; 
            } else {
                img.style.maxWidth = '45%';
                img.style.maxHeight = '45%';
                img.style.objectFit = 'contain';
                img.style.display = 'inline-block';
                img.style.position = 'relative'; 
                img.style.zIndex = '10'; 
                // 🟢 CRÍTICO: La imagen (ej. hierba.png) intercepta el clic sin importar dónde esté flotando el Gengar.
                img.style.pointerEvents = 'auto'; 
            }

            const altText = img.getAttribute('alt');
            if (altText && altText.includes('|mp-link|')) {
                const parts = altText.split('|mp-link|');
                img.setAttribute('alt', parts[0] || "");
                img.setAttribute('data-target-note', parts[1] || "");
                img.style.cursor = 'pointer';
            }
        });

        if (useFullSpace) {
            contentDiv.style.zIndex = "1"; 
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
        requestAnimationFrame(this.animate);
        
        // Interpolación de posición (Lerp lineal al 10% por frame)
        this.camera.position.x += (this.targetX - this.camera.position.x) * 0.1;
        this.camera.position.z += (this.targetZ - this.camera.position.z) * 0.1;
        
        // Interpolación de rotación
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
