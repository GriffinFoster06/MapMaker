// Spike 1b: bundle Azgaar's unmodified hydrology generators for Node.
// Importing them registers window.Lakes / window.Features / window.Rivers.
export { Voronoi } from '../_work/azgaar/src/generators/voronoi';
import '../_work/azgaar/src/generators/lakes';
import '../_work/azgaar/src/generators/features-generator';
import '../_work/azgaar/src/generators/river-generator';
