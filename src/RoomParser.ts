export interface RoomData {
    title: string;
    customTitle: string | null;
    color?: string;
    front?: string | null;
    back?: string | null;
    up: string;
    down: string;
    left: string;
    right: string;
    content?: string | null; // NUEVO: Ítem flotante central
    zOffset: number;
}

export function parseRoomsFromText(text: string, roomDistance: number = 1000): RoomData[] {
    const rooms: RoomData[] = [];
    
    const roomBlocks = text.split(/(?=^##\s+Room)/gm).filter(b => b.trim().startsWith("## Room"));

    roomBlocks.forEach((block, index) => {
        const lines = block.split('\n');
        const firstLine = (lines[0] || "Room").trim();
        
        let title = firstLine.replace("## ", "");
        let customTitle = null;
        
        if (firstLine.includes(":")) {
            const parts = firstLine.split(":");
            title = (parts[0] ?? "Room").replace("## ", "").trim();
            customTitle = (parts[1] ?? "").trim();
        }
        
        let color: string | undefined = undefined;
        let front: string | null = null;
        let back: string | null = null;
        let contentField: string | null = null; // Variable temporal para content
        let up: string = "";
        let down: string = "";
        let left: string = "";
        let right: string = "";

        lines.forEach(line => {
            const cleanLine = line.trim();
            const normalizedLine = cleanLine.replace(/^-\s+\*\*/, "").replace(/\*\*:/, ":").replace(/^-/, "").trim();
            
            if (normalizedLine.includes(":")) {
                const separatorIndex = normalizedLine.indexOf(":");
                const key = normalizedLine.substring(0, separatorIndex).trim().toLowerCase();
                const value = normalizedLine.substring(separatorIndex + 1).trim();

                switch (key) {
                    case "color": 
                        if (value) color = value; 
                        break;
                    case "front": 
                        if (value) front = value; 
                        break;
                    case "back": 
                        if (value) back = value; 
                        break;
                    case "content": 
                        if (value) contentField = value; // Captura el contenido central flotante
                        break;
                    case "up": 
                        up = value; 
                        break;
                    case "down": 
                        down = value; 
                        break;
                    case "left": 
                        left = value; 
                        break;
                    case "right": 
                        right = value; 
                        break;
                }
            }
        });

        rooms.push({
            title: title,
            customTitle: customTitle,
            color: color,
            front: front,
            back: back,
            up: up,
            down: down,
            left: left,
            right: right,
            content: contentField, // Se añade al objeto final
            zOffset: index * -roomDistance
        });
    });

    return rooms;
}