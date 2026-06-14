## Memory Palace 3D for Obsidian

Transform your notes into a navigable **3D Memory Palace**. This plugin uses `Three.js` (CSS3DRenderer) to render your Markdown notes into a structure of interconnected rooms, allowing you to visualize your knowledge as a physical 3D space.

## 🚀 Key Features

* **Spatial Architecture:** Visualize your notes structured into "rooms".


* **Interactivity:** Navigate your notes directly in the 3D environment; internal links (`[[WikiLinks]]`) and embedded images are fully clickable.


* **Customization:** Configure the distance between levels and the visual behavior of images on walls.


* **Intuitive Navigation:** FPS-style controls (WASD) to explore your knowledge.



---

## 🛠️ Usage Guide

The plugin automatically detects sections marked as `## Room` within your notes.

### Note Syntax

Each room is defined with a `## Room` header and a list of properties. You can add simple Markdown text or even images.

```markdown
## Room : The Room Title
- color: #3498db
- front: ![[Example image.png]]
- back: Notes on this topic.
- up: Top wall with content.
- down: Bottom wall.
- left: [[Related note]]
- right: Content on the right.
- content: This is the floating central object in the middle of the room.

```

* **`color`**: Defines the background color of the room walls (valid CSS format).


* **`front`, `back`, `up`, `down`, `left`, `right**`: Defines the content for each face of the cube.


* **`content`**: Inserts a floating element in the center of the room.

* You can attach a note to an image like this:
```markdown
[[YourNote]](![[YourImage.png]])
```
* The plugin supports Zotflow links and Excalidraw diagrams.


---

## ⌨️ Navigation Controls

Once the "Memory Palace 3D" panel is open, use the following controls:

| Action | Control |
| --- | --- |
| **Move** | `W`, `A`, `S`, `D` |
| **Zoom (In/Out)** | Mouse Wheel (Scroll) |
| **Rotate View** | Shift + Mouse Move |
| **Center/Reset** | `Q` |

---

## ⚙️ Plugin Settings

You can adjust the rendering behavior in the plugin settings:

* **Distance between rooms:** Defines the separation (on the Z axis) between each level of the palace. A higher value creates a longer corridor.


* **Full wall images:**
* *Enabled:* Embedded images will stretch to occupy 100% of the wall face (ideal for backgrounds).
* *Disabled:* Images maintain their original aspect ratio and are presented as elements within the wall.




## 🛠️ Developer Notes

This plugin is built using:

* **Obsidian API:** For file management and Markdown rendering[cite: 2, 3].
* **Three.js (CSS3DRenderer):** For 3D projection of DOM elements.


* **TypeScript (Strict Mode):** To ensure stability and correct typing of interactions.
