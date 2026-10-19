import * as THREE from 'https://esm.sh/three@0.136.0/build/three.module.js';
import { OrbitControls } from 'https://esm.sh/three@0.136.0/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'https://esm.sh/three@0.136.0/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'https://esm.sh/three@0.136.0/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'https://esm.sh/three@0.136.0/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'https://esm.sh/three@0.136.0/examples/jsm/postprocessing/UnrealBloomPass.js';

const canvas = document.querySelector('#goo-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.z = 5;

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

const rotatingGroup = new THREE.Group();
scene.add(rotatingGroup);

const starGeometry = new THREE.BufferGeometry();
const starCount = 1;
const starsPositions = new Float32Array(starCount * 3);
for (let i = 0; i < starCount * 3; i++) {
    starsPositions[i] = (Math.random() - 0.5) * 200;
}
starGeometry.setAttribute('position', new THREE.BufferAttribute(starsPositions, 3));
const starMaterial = new THREE.PointsMaterial({
    color: 'cyan',
    size: 0.1,
    sizeAttenuation: true
});
const stars = new THREE.Points(starGeometry, starMaterial);
scene.add(stars);

const innerGeometry = new THREE.IcosahedronGeometry(1, 3);
const innerMaterial = new THREE.MeshStandardMaterial({
    color: 0x222222,
    roughness: 0.5,
    metalness: 1,
    flatShading: true,
    transparent: true,
    opacity: 0.7
});
const innerMesh = new THREE.Mesh(innerGeometry, innerMaterial);
rotatingGroup.add(innerMesh);

const outerGeometry = new THREE.IcosahedronGeometry(1.15, 3);
const wireframeMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    wireframe: true,
    transparent: true,
    opacity: 0.1
});
const wireframeMesh = new THREE.Mesh(outerGeometry, wireframeMaterial);
rotatingGroup.add(wireframeMesh);

const positions = [];
const posAttr = outerGeometry.attributes.position;
for (let i = 0; i < posAttr.count; i++) {
    positions.push(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
}

const particleGeometry = new THREE.BufferGeometry();
particleGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
const particleMaterial = new THREE.PointsMaterial({
    color: '#0B72E7',
    size: 0.025
});
const particles = new THREE.Points(particleGeometry, particleMaterial);
rotatingGroup.add(particles);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    1.5,
    0.4,
    0.05
);
composer.addPass(bloomPass);

const maxRipples = 10;
const RippleShader = {
    uniforms: {
        tDiffuse: { value: null },
        centers: { value: Array(maxRipples).fill().map(() => new THREE.Vector2(0.5, 0.5)) },
        times: { value: Array(maxRipples).fill(0.0) },
        rippleActive: { value: Array(maxRipples).fill(0.0) },
        maxRadius: { value: 1.0 },
        amplitude: { value: 0.03 },
        secondaryAmplitude: { value: 0.01 },
        speed: { value: 0.3 },
        frequency: { value: 10.0 },
        aspect: { value: window.innerWidth / window.innerHeight },
        smoothing: { value: 0.95 },
        sigma: { value: 0.6 },
        fadeDuration: { value: 6.0 }
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      #define PI 3.14159265359
      #define MAX_RIPPLES ${maxRipples}
      uniform sampler2D tDiffuse;
      uniform vec2 centers[MAX_RIPPLES];
      uniform float times[MAX_RIPPLES];
      uniform float rippleActive[MAX_RIPPLES];
      uniform float maxRadius;
      uniform float amplitude;
      uniform float secondaryAmplitude;
      uniform float speed;
      uniform float frequency;
      uniform float aspect;
      uniform float smoothing;
      uniform float sigma;
      uniform float fadeDuration;
      varying vec2 vUv;

      void main() {
        vec2 uv = vUv;
        vec2 totalWave = vec2(0.0);
        for (int i = 0; i < MAX_RIPPLES; i++) {
          if (rippleActive[i] > 0.0) {
            vec2 aspectUV = vec2((uv.x - centers[i].x) * aspect, uv.y - centers[i].y);
            float dist = length(aspectUV);
            float t = times[i] * speed;
            if (dist < t) {
              float normDist = dist / maxRadius;
              float decay = 1.0 / (1.0 + sigma * normDist * normDist);
              float timeFade = pow(smoothstep(fadeDuration, fadeDuration - 2.0, times[i]), 2.0);
              float smoothFactor = smoothstep(1.0 - smoothing, 1.0, normDist);
              float primaryWave = amplitude * sin(frequency * (t - dist)) * decay * (1.0 - smoothFactor) * timeFade;
              float secondaryWave = secondaryAmplitude * sin(0.5 * frequency * (t - dist) + PI) * decay * (1.0 - smoothFactor) * timeFade;
              totalWave += normalize(aspectUV) * (primaryWave + secondaryWave);
            }
          }
        }
        uv += totalWave;
        gl_FragColor = texture2D(tDiffuse, clamp(uv, 0.0, 1.0));
      }
    `
};

const ripplePass = new ShaderPass(RippleShader);
ripplePass.renderToScreen = true;
composer.addPass(ripplePass);

let ripples = [];
const rippleDuration = 25;

function updateRippleUniforms() {
    const centers = ripplePass.uniforms.centers.value;
    const times = ripplePass.uniforms.times.value;
    const active = ripplePass.uniforms.rippleActive.value;
    for (let i = 0; i < maxRipples; i++) {
        if (i < ripples.length) {
            centers[i].copy(ripples[i].center);
            times[i] = performance.now() / 1000 - ripples[i].startTime;
            active[i] = times[i] < rippleDuration ? 1.0 : 0.0;
        } else {
            active[i] = 0.0;
        }
    }
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
    bloomPass.setSize(window.innerWidth, window.innerHeight);
    ripplePass.uniforms.aspect.value = window.innerWidth / window.innerHeight;
});

function animate() {
    requestAnimationFrame(animate);
    controls.update();

    rotatingGroup.rotation.x += 0.002;
    rotatingGroup.rotation.y += 0.003;

    if (ripples.length > 0) {
        updateRippleUniforms();
        ripples = ripples.filter(ripple => (performance.now() / 1000 - ripple.startTime) < rippleDuration);
    }

    composer.render();
}

animate();
//////////////////////////////////////////////////////////////////
const blockedKeywords = ['spam', 'games', '.io', 'poker','poki','rule34','x.com','twitter.com','tiktok.com',''];
const blockedKeywordsmore = ['porn', 'proxy','coon'];
//////////////////////////////////////////////////////////////////
async function appendSearchToTextFile(url) {
    const cleanedUrl = url.trim().toLowerCase();
    if (!cleanedUrl) return;

    try {
        const response = await fetch('/api/search-history', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ url: cleanedUrl })
        });

        if (!response.ok) {
            throw new Error('Failed to save search history');
        }
    } catch (error) {
        console.error('Could not save to text.txt:', error);
    }
}

async function checkUrl() {
    const input = document.getElementById('urlInput');
    const resultDiv = document.getElementById('result');
    const url = input.value.trim().toLowerCase();

    if (url === '') {
        resultDiv.innerHTML = 'Please enter a link first.';
        resultDiv.className = '';
        return;
    }

    if (!/^(https?:\/\/)?www\./i.test(url)) {
        resultDiv.textContent = 'Please enter a link that starts with www.';
        resultDiv.className = 'blocked';
        return;
    }

    await appendSearchToTextFile(url);

    const foundKeywords = [];
    const foundBlocked = [];

    for (const word of blockedKeywords) {
        if (url.includes(word.toLowerCase())) {
            foundKeywords.push(word);
        }
    }

    for (const word of blockedKeywordsmore) {
        if (url.includes(word.toLowerCase())) {
            foundBlocked.push(word);
        }
    }

    if (foundKeywords.length > 0) {
        resultDiv.innerHTML = '⚠️ <strong>Blocked!</strong> The link contains these keywords: ' + foundKeywords.join(', ');
        resultDiv.className = 'blocked';
    } else if (foundBlocked.length > 0) {
        resultDiv.innerHTML = '🛑 <strong>Blocked!</strong> The search result is blocked because of: ' + foundBlocked.join(', ');
        resultDiv.className = 'blocked';
    } else {
        resultDiv.innerHTML = '✅ <strong>Safe!</strong> Not blocked.';
        resultDiv.className = 'safe';
    }
}

window.checkUrl = checkUrl;

document.querySelector('button').addEventListener('click', checkUrl);
document.getElementById('urlInput').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        checkUrl();
    }
});
