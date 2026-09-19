import * as Cesium from 'cesium';

/** Phones report widths under this many CSS px; used to lighten GPU load. */
const MOBILE_MAX_WIDTH = 720;

function isMobileViewport() {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH}px)`).matches
  );
}

/**
 * Phones kill the WebGL context under memory pressure with no warning; show
 * a tappable overlay so the user can recover instead of staring at a dead
 * globe. Returns a cleanup function.
 */
function installContextLossRecovery(viewer) {
  const canvas = viewer.canvas;
  if (!canvas || typeof canvas.addEventListener !== 'function') return () => {};
  const overlay = document.createElement('div');
  overlay.setAttribute('role', 'alert');
  overlay.style.cssText = [
    'position:fixed',
    'inset:0',
    'z-index:9999',
    'display:none',
    'align-items:center',
    'justify-content:center',
    'text-align:center',
    'padding:24px',
    'background:rgba(4,10,16,0.92)',
    'color:#cfe9f5',
    'font:500 14px/1.6 ui-monospace,Menlo,monospace',
    'cursor:pointer',
  ].join(';');
  overlay.innerHTML =
    '<div>3D VIEW PAUSED<br><span style="opacity:.65;font-size:12px">The phone reclaimed graphics memory.<br>Tap anywhere to resume.</span></div>';
  const show = () => {
    overlay.style.display = 'flex';
  };
  const hide = () => {
    overlay.style.display = 'none';
  };
  const onLost = (event) => {
    // Preventing default lets the browser restore the context.
    event.preventDefault();
    show();
  };
  const onRestored = () => hide();
  canvas.addEventListener('webglcontextlost', onLost, false);
  canvas.addEventListener('webglcontextrestored', onRestored, false);
  overlay.addEventListener('click', hide);
  document.body.appendChild(overlay);
  return () => {
    canvas.removeEventListener('webglcontextlost', onLost, false);
    canvas.removeEventListener('webglcontextrestored', onRestored, false);
    overlay.remove();
  };
}

/** Create the standard globe viewer in caller-owned, visible containers. */
export function createApplicationViewer({ container, creditContainer }) {
  if (!container || !creditContainer)
    throw new TypeError('Viewer and credit containers are required');
  const mobile = isMobileViewport();
  const viewer = new Cesium.Viewer(container, {
    timeline: false,
    animation: false,
    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    fullscreenButton: false,
    vrButton: false,
    selectionIndicator: false,
    infoBox: false,
    baseLayer: false,
    creditContainer,
    // Phones get no MSAA and a capped render scale: far less GPU memory,
    // fewer driver kills, longer battery. Desktop keeps full quality.
    msaaSamples: mobile ? 1 : 4,
    contextOptions: { webgl: { preserveDrawingBuffer: true } },
  });
  const uninstallRecovery = installContextLossRecovery(viewer);
  // Surfaced for the scene owner so the overlay/listeners are removed with
  // the viewer instead of leaking across restarts.
  viewer.uninstallContextLossRecovery = uninstallRecovery;
  try {
    viewer.targetFrameRate = 60;
    if (mobile) {
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      // Cap effective resolution at ~1.5x so a 3x phone screen doesn't
      // allocate a 3x render buffer.
      viewer.resolutionScale = Math.min(1, 1.5 / dpr);
    }
    viewer.scene.globe.show = false;
    viewer.scene.skyAtmosphere.show = true;
    viewer.scene.skyAtmosphere.atmosphereLightIntensity = 18;
    viewer.scene.skyAtmosphere.saturationShift = -0.12;
    viewer.scene.skyAtmosphere.brightnessShift = -0.08;
    return viewer;
  } catch (error) {
    uninstallRecovery();
    viewer.destroy();
    throw error;
  }
}
