/**
 * Three.js 3D Point Cloud Renderer
 * ==================================
 * Renders RealSense D435i depth data as an interactive 3D point cloud.
 * Points are colored by height (distance from conveyor surface).
 */

class PointCloudRenderer {
    constructor(containerId, canvasId) {
        this.container = document.getElementById(containerId);
        this.canvas = document.getElementById(canvasId);
        
        if (!this.container || !this.canvas) {
            console.warn('[3D] Container or canvas not found');
            return;
        }

        this._initScene();
        this._initCamera();
        this._initLights();
        this._initControls();
        this._initConveyorPlane();
        this._initPointCloud();
        this._initInteraction();
        
        this._animate = this._animate.bind(this);
        this._onResize = this._onResize.bind(this);
        window.addEventListener('resize', this._onResize);
        this._onResize();
        this._animate();
    }

    _initScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0xf8fafc); // Light industrial background
        this.scene.fog = new THREE.FogExp2(0xf8fafc, 0.8);

        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            alpha: false,
        });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    }

    _initCamera() {
        const aspect = this.container.clientWidth / this.container.clientHeight;
        this.camera = new THREE.PerspectiveCamera(50, aspect, 0.01, 10);
        this.camera.position.set(0.5, 0.6, 0.8);
        this.camera.lookAt(0, 0, 0);
    }

    _initLights() {
        const ambient = new THREE.AmbientLight(0x334466, 0.6);
        this.scene.add(ambient);

        const directional = new THREE.DirectionalLight(0xffffff, 0.8);
        directional.position.set(1, 2, 1);
        this.scene.add(directional);
    }

    _initControls() {
        // Simple orbit controls (manual implementation to avoid extra imports)
        this._isDragging = false;
        this._prevMouse = { x: 0, y: 0 };
        this._spherical = { radius: 1.2, theta: Math.PI / 4, phi: Math.PI / 3 };

        this.canvas.addEventListener('mousedown', (e) => {
            this._isDragging = true;
            this._prevMouse = { x: e.clientX, y: e.clientY };
        });

        this.canvas.addEventListener('mousemove', (e) => {
            if (!this._isDragging) return;
            const dx = e.clientX - this._prevMouse.x;
            const dy = e.clientY - this._prevMouse.y;
            this._spherical.theta -= dx * 0.005;
            this._spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1,
                this._spherical.phi - dy * 0.005));
            this._prevMouse = { x: e.clientX, y: e.clientY };
            this._updateCamera();
        });

        this.canvas.addEventListener('mouseup', () => { this._isDragging = false; });
        this.canvas.addEventListener('mouseleave', () => { this._isDragging = false; });

        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            this._spherical.radius *= (1 + e.deltaY * 0.001);
            this._spherical.radius = Math.max(0.3, Math.min(3, this._spherical.radius));
            this._updateCamera();
        }, { passive: false });

        this._updateCamera();
    }

    resetView() {
        this._spherical = { radius: 1.2, theta: Math.PI / 4, phi: Math.PI / 3.2 };
        this._updateCamera();
    }

    _updateCamera() {
        const { radius, theta, phi } = this._spherical;
        this.camera.position.set(
            radius * Math.sin(phi) * Math.cos(theta),
            radius * Math.cos(phi),
            radius * Math.sin(phi) * Math.sin(theta)
        );
        this.camera.lookAt(0, 0, 0);
    }

    _initConveyorPlane() {
        // Grid
        const grid = new THREE.GridHelper(3, 30, 0x94a3b8, 0x475569);
        grid.position.y = -0.01;
        this.scene.add(grid);

        // Conveyor belt plane. Built at the default width and then resized by
        // setBeltWidth() from live state — the Line Control width slider has to
        // move this too, or the point cloud sits on a belt of the wrong size.
        const planeMat = new THREE.MeshBasicMaterial({
            color: 0x111827,
            transparent: true,
            opacity: 0.5,
            side: THREE.DoubleSide,
        });
        this.beltPlane = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.5), planeMat);
        this.beltPlane.rotation.x = -Math.PI / 2;
        this.beltPlane.position.y = -0.005;
        this.scene.add(this.beltPlane);
        this._beltWidth = 1.4;
    }

    /**
     * Resize the belt plane to the live belt width.
     *
     * Three.js geometry is immutable in size, so the old one is disposed and
     * replaced rather than scaled — scaling a plane would also stretch nothing
     * else, but disposing keeps the GPU buffer count flat as the slider moves.
     */
    setBeltWidth(width) {
        if (!this.beltPlane || typeof width !== 'number' || !isFinite(width)) return;
        if (Math.abs(width - this._beltWidth) < 0.01) return;
        this._beltWidth = width;
        this.beltPlane.geometry.dispose();
        this.beltPlane.geometry = new THREE.PlaneGeometry(width, 1.5);
    }

    _initInteraction() {
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        
        // Add click listener to canvas
        this.canvas.addEventListener('click', this._onClick.bind(this));
        
        // Add pointer style when hovering boxes
        this.canvas.addEventListener('mousemove', this._onMouseMove.bind(this));
    }

    _onClick(event) {
        const rect = this.canvas.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);
        
        // Check intersections with box helpers
        const intersects = this.raycaster.intersectObjects(this.boxHelpers, false);
        if (intersects.length > 0) {
            const id = intersects[0].object.userData.id;
            if (id && window.showHistoricalScan) {
                window.showHistoricalScan(id, event);
            }
        }
    }

    _onMouseMove(event) {
        if (this._isDragging) return;
        
        const rect = this.canvas.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);
        
        // We only raycast against the box geometries
        const intersects = this.raycaster.intersectObjects(this.boxHelpers || [], false);
        this.canvas.style.cursor = intersects.length > 0 ? 'pointer' : 'default';
    }

    _initPointCloud() {
        // Create initial point cloud with a maximum buffer size
        this.maxPoints = 12000;
        const positions = new Float32Array(this.maxPoints * 3);
        const colors = new Float32Array(this.maxPoints * 3);
        
        this.boxHelpers = []; // Array to store bounding boxes

        this.pointGeometry = new THREE.BufferGeometry();
        this.pointGeometry.setAttribute('position',
            new THREE.Float32BufferAttribute(positions, 3));
        this.pointGeometry.setAttribute('color',
            new THREE.Float32BufferAttribute(colors, 3));

        const pointMaterial = new THREE.PointsMaterial({
            size: 0.05,
            vertexColors: true,
            sizeAttenuation: true,
            transparent: true,
            opacity: 0.9,
        });

        this.points = new THREE.Points(this.pointGeometry, pointMaterial);
        this.scene.add(this.points);
    }

    /**
     * Update the point cloud with new data.
     * @param {Object} data - { positions: [[x,y,z],...], heights: [h,...] }
     */
    updatePointCloud(data) {
        if (!data || !data.positions || data.positions.length === 0) return;

        const positions = this.pointGeometry.attributes.position.array;
        const colors = this.pointGeometry.attributes.color.array;
        const count = Math.min(data.positions.length, this.maxPoints);

        for (let i = 0; i < count; i++) {
            const [x, y, z] = data.positions[i];
            // Transform: X=lateral, Y=height off belt, Z=depth along belt
            positions[i * 3] = x;
            positions[i * 3 + 1] = (data.heights && data.heights[i]) !== undefined ? data.heights[i] : 0;
            positions[i * 3 + 2] = y;

            // Color by height: blue (low/conveyor) → cyan → green → yellow → red (high/item peak)
            const h = Math.max(0, Math.min(1, (data.heights[i] || 0) / 0.3));
            const color = this._heightToColor(h);
            colors[i * 3] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;
        }

        // Zero out remaining points
        for (let i = count; i < this.maxPoints; i++) {
            positions[i * 3] = 0;
            positions[i * 3 + 1] = -10; // hide off-screen
            positions[i * 3 + 2] = 0;
        }

        this.pointGeometry.attributes.position.needsUpdate = true;
        this.pointGeometry.attributes.color.needsUpdate = true;
        this.pointGeometry.setDrawRange(0, count);

        // Update bounding boxes
        this._updateBoundingBoxes(data.boxes || []);
    }
    
    _updateBoundingBoxes(boxes) {
        // Remove old boxes
        for (const helper of this.boxHelpers) {
            this.scene.remove(helper);
        }
        this.boxHelpers = [];

        for (const box of boxes) {
            const geometry = new THREE.BoxGeometry(box.w, box.h, box.l);
            const edges = new THREE.EdgesGeometry(geometry);
            const material = new THREE.LineBasicMaterial({ color: new THREE.Color(box.color) });
            const line = new THREE.LineSegments(edges, material);
            
            // Transform: X=lateral, Y=height, Z=depth
            line.position.set(box.x, box.h / 2, box.y); 
            line.userData = { id: box.id }; // Store the ID for interaction!
            
            // To make raycasting easier against wireframes, we can attach an invisible solid mesh
            const clickMesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({visible: false}));
            clickMesh.position.copy(line.position);
            clickMesh.userData = { id: box.id };
            this.scene.add(clickMesh);
            this.boxHelpers.push(clickMesh);
            
            this.scene.add(line);
            this.boxHelpers.push(line);
        }
    }

    _heightToColor(t) {
        // Turbo-like colormap: blue → cyan → green → yellow → red
        if (t < 0.25) {
            const s = t / 0.25;
            return { r: 0.1, g: s * 0.5, b: 0.5 + s * 0.5 };
        } else if (t < 0.5) {
            const s = (t - 0.25) / 0.25;
            return { r: 0, g: 0.5 + s * 0.5, b: 1 - s * 0.5 };
        } else if (t < 0.75) {
            const s = (t - 0.5) / 0.25;
            return { r: s, g: 1, b: 0.5 - s * 0.5 };
        } else {
            const s = (t - 0.75) / 0.25;
            return { r: 1, g: 1 - s * 0.7, b: 0 };
        }
    }

    _onResize() {
        if (!this.container) return;
        const w = this.container.clientWidth;
        const h = this.container.clientHeight;
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h);
    }

    _animate() {
        requestAnimationFrame(this._animate);
        // Slow auto-rotation when not dragging
        if (!this._isDragging) {
            this._spherical.theta += 0.001;
            this._updateCamera();
        }
        this.renderer.render(this.scene, this.camera);
    }
}

// Export globally
window.PointCloudRenderer = PointCloudRenderer;
