// Colour palettes of orogen's globe, for the UI. Re-exports the vendored leaf module color-map.js only, so the main
// thread does not pull the generation code into its bundle. Original shell code.
export { biomeColor, elevationToColor } from '../vendor/js/color-map.js';
