// ============================================================
// SpaceBackdrop.js — smooth volumetric nebula background
// Creates a large sky sphere with gradient nebula texture
// NOT particle-based - uses a smooth canvas texture for realism
// ============================================================

import {
  SphereGeometry, MeshBasicMaterial, Mesh, BackSide,
  CanvasTexture, Color, Vector3, Group, AdditiveBlending,
} from 'three';

// Deep space background - large sphere with smooth gradient nebula
export class SpaceBackdrop {
  constructor(scene) {
    this._scene = scene;
    this._meshes = [];
    this._build();
  }

  _build() {
    // Remove any existing meshes
    this.dispose();

    // Create smooth nebula backdrop sphere (just the volumetric clouds)
    const nebulaSphere = this._createNebulaSphere();
    this._scene.add(nebulaSphere);
    this._meshes.push(nebulaSphere);
  }

  // Large sphere with smooth nebula gradient texture
  _createNebulaSphere() {
    const geometry = new SphereGeometry(8500, 64, 64);

    // Create smooth nebula texture
    const texture = this._generateNebulaTexture();

    const material = new MeshBasicMaterial({
      map: texture,
      side: BackSide,
      transparent: false,
      fog: false,
    });

    const mesh = new Mesh(geometry, material);
    mesh.renderOrder = -1000; // Draw first, behind everything
    return mesh;
  }

  // Generate smooth nebula canvas texture
  _generateNebulaTexture() {
    const size = 2048; // High res for smooth gradients
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size / 2; // Equirectangular
    const ctx = canvas.getContext('2d');

    // Fill with deep space black
    ctx.fillStyle = '#050210';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Create smooth nebula clouds - vibrant purple/pink like reference
    const nebulaSpots = [
      { x: 0.15, y: 0.25, r: 0.55, color: '#d946ef', alpha: 0.45 }, // bright magenta (upper left)
      { x: 0.85, y: 0.3, r: 0.5, color: '#8b5cf6', alpha: 0.4 },  // violet (upper right)
      { x: 0.5, y: 0.5, r: 0.6, color: '#a855f7', alpha: 0.35 },  // purple (center)
      { x: 0.25, y: 0.65, r: 0.5, color: '#ec4899', alpha: 0.4 },  // pink (lower left)
      { x: 0.7, y: 0.75, r: 0.45, color: '#6366f1', alpha: 0.32 }, // indigo (lower right)
      { x: 0.05, y: 0.45, r: 0.35, color: '#3b82f6', alpha: 0.25 }, // blue (far left)
      { x: 0.6, y: 0.15, r: 0.4, color: '#c084fc', alpha: 0.3 },  // light purple (top)
      { x: 0.35, y: 0.85, r: 0.3, color: '#f472b6', alpha: 0.28 }, // hot pink (bottom)
    ];

    // Draw smooth nebula clouds
    for (const spot of nebulaSpots) {
      const cx = spot.x * canvas.width;
      const cy = spot.y * canvas.height;
      const r = spot.r * canvas.width;

      // Large soft radial gradient for each nebula cloud
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      const baseColor = spot.color;
      const rVal = parseInt(baseColor.slice(1, 3), 16);
      const gVal = parseInt(baseColor.slice(3, 5), 16);
      const bVal = parseInt(baseColor.slice(5, 7), 16);

      grad.addColorStop(0, `rgba(${rVal},${gVal},${bVal},${spot.alpha})`);
      grad.addColorStop(0.3, `rgba(${rVal},${gVal},${bVal},${spot.alpha * 0.7})`);
      grad.addColorStop(0.6, `rgba(${rVal},${gVal},${bVal},${spot.alpha * 0.3})`);
      grad.addColorStop(1, `rgba(${rVal},${gVal},${bVal},0)`);

      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Add subtle dust lanes / structure
    for (let i = 0; i < 8; i++) {
      const y = Math.random() * canvas.height;
      const height = 50 + Math.random() * 100;

      const dustGrad = ctx.createLinearGradient(0, y, canvas.width, y + height * 0.5);
      dustGrad.addColorStop(0, 'rgba(20, 15, 40, 0)');
      dustGrad.addColorStop(0.5, 'rgba(15, 12, 35, 0.15)');
      dustGrad.addColorStop(1, 'rgba(20, 15, 40, 0)');

      ctx.fillStyle = dustGrad;
      ctx.fillRect(0, y, canvas.width, height);
    }

    // Add fine noise grain for realism
    this._addNoise(ctx, canvas.width, canvas.height, 0.03);

    const texture = new CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  // Distant star glow layer - very subtle
  _createStarGlowSphere() {
    const geometry = new SphereGeometry(8200, 32, 32);

    const texture = this._generateDistantStarsTexture();

    const material = new MeshBasicMaterial({
      map: texture,
      side: BackSide,
      transparent: true,
      opacity: 0.9,
      blending: AdditiveBlending,
      fog: false,
      depthWrite: false,
    });

    const mesh = new Mesh(geometry, material);
    mesh.renderOrder = -999;
    return mesh;
  }

  // Generate distant stars texture
  _generateDistantStarsTexture() {
    const size = 4096; // Very high res for crisp stars
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size / 2;
    const ctx = canvas.getContext('2d');

    // Transparent background
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw distant stars with varying brightness
    const starCount = 3000;

    for (let i = 0; i < starCount; i++) {
      const x = Math.random() * canvas.width;
      const y = Math.random() * canvas.height;

      // Size variation - most tiny, some large
      const sizeRoll = Math.random();
      let size, alpha, glow;

      if (sizeRoll > 0.98) {
        // Bright giants (2%)
        size = 4 + Math.random() * 6;
        alpha = 0.8 + Math.random() * 0.2;
        glow = true;
      } else if (sizeRoll > 0.9) {
        // Medium bright (8%)
        size = 2 + Math.random() * 3;
        alpha = 0.5 + Math.random() * 0.3;
        glow = Math.random() > 0.5;
      } else {
        // Tiny stars (90%)
        size = 0.5 + Math.random() * 1.5;
        alpha = 0.2 + Math.random() * 0.4;
        glow = false;
      }

      // Star color - mostly white/blue, some warm
      const colorRoll = Math.random();
      let color;
      if (colorRoll > 0.85) {
        color = `255,${200 + Math.random() * 55},${150 + Math.random() * 100}`; // warm
      } else if (colorRoll > 0.6) {
        color = `200,${220 + Math.random() * 35},255`; // blue-white
      } else {
        color = `255,255,${240 + Math.random() * 15}`; // white
      }

      // Draw star with glow if bright
      if (glow) {
        // Outer glow
        const glowGrad = ctx.createRadialGradient(x, y, 0, x, y, size * 4);
        glowGrad.addColorStop(0, `rgba(${color},${alpha * 0.5})`);
        glowGrad.addColorStop(0.5, `rgba(${color},${alpha * 0.2})`);
        glowGrad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = glowGrad;
        ctx.beginPath();
        ctx.arc(x, y, size * 4, 0, Math.PI * 2);
        ctx.fill();
      }

      // Core star
      ctx.fillStyle = `rgba(${color},${alpha})`;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    }

    const texture = new CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  // Add subtle noise texture
  _addNoise(ctx, w, h, intensity) {
    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      const noise = (Math.random() - 0.5) * intensity * 255;
      data[i] = Math.max(0, Math.min(255, data[i] + noise));
      data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise));
      data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise));
    }

    ctx.putImageData(imageData, 0, 0);
  }

  // Update with palette colors
  setColors(palette) {
    // Regenerate with new colors if needed
    this.dispose();
    this._build();
  }

  dispose() {
    for (const mesh of this._meshes) {
      this._scene.remove(mesh);
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) {
        if (mesh.material.map) mesh.material.map.dispose();
        mesh.material.dispose();
      }
    }
    this._meshes = [];
  }
}
