import path from 'node:path';
import { Lane } from '../src/lane.mjs';

const lane = new Lane(path.join(process.cwd(), 'data', 'home'));
console.log(JSON.stringify(lane.check(), null, 2));
