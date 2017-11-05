import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

export const BATTLEHACK_PATH = path.join(os.homedir(), '.battlehack17');
export const MAPS = path.join(BATTLEHACK_PATH, 'maps');
export const REPLAYS = path.join(BATTLEHACK_PATH, 'replays');
export const CREDENTIALS = path.join(BATTLEHACK_PATH, 'credentials.json');

const ensure = (dir) => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir);
    }
}
ensure(BATTLEHACK_PATH);
ensure(MAPS);
ensure(REPLAYS);

// we're in dist/src/
export const PACKAGED_MAPS = path.join(path.dirname(path.dirname(__dirname)), 'defaultmaps');