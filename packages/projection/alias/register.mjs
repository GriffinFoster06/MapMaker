// Registers the d3-dmath alias (d3-dmath.mjs) as Node module hooks: `tsx --import ./packages/projection/alias/register.mjs`.
import { register } from 'node:module';

register('./d3-dmath.mjs', import.meta.url);
