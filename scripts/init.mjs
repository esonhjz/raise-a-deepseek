import path from 'node:path';
import { initHome, homeLayout } from '../src/home.mjs';

const home = initHome(path.join(process.cwd(), 'data', 'home'));
const layout = homeLayout(home);
console.log(JSON.stringify({ status: 'ok', home, layout }, null, 2));
