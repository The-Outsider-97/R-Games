import * as THREE from 'three';

document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('academy-canvas');
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x020617, 0.035);

  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 6, 14);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0xffffff, 0.45));
  const key = new THREE.PointLight(0x38bdf8, 2, 80);
  key.position.set(2, 8, 6);
  scene.add(key);

  const grid = new THREE.Group();
  const tileGeo = new THREE.BoxGeometry(1.8, 0.2, 1.8);
  for (let x = -6; x <= 6; x += 1) {
    for (let z = -6; z <= 6; z += 1) {
      if (Math.random() > 0.72) continue;
      const mat = new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        emissive: 0x0ea5e9,
        emissiveIntensity: Math.random() * 0.2 + 0.06,
      });
      const tile = new THREE.Mesh(tileGeo, mat);
      tile.position.set(x * 1.6, -2 + (Math.random() - 0.5) * 0.5, z * 1.6);
      tile.userData.baseY = tile.position.y;
      grid.add(tile);
    }
  }
  scene.add(grid);

  const orb = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.3, 1),
    new THREE.MeshPhysicalMaterial({ color: 0xffffff, emissive: 0x22d3ee, roughness: 0.12, transmission: 0.8, thickness: 1.1 })
  );
  orb.position.set(0, 1.6, 0);
  scene.add(orb);

  const clock = new THREE.Clock();
  function animate() {
    requestAnimationFrame(animate);
    const t = clock.getElapsedTime();
    grid.children.forEach((tile, i) => {
      tile.position.y = tile.userData.baseY + Math.sin(t * 1.8 + i * 0.15) * 0.12;
    });
    orb.rotation.y += 0.01;
    orb.position.y = 1.6 + Math.sin(t * 1.3) * 0.25;
    renderer.render(scene, camera);
  }
  animate();

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
});
