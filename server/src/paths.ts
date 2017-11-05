import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import * as mkdirp from 'mkdirp';

export const BATTLEHACK_PATH = path.join(os.homedir(), '.battlehack17');

if (!fs.existsSync(BATTLEHACK_PATH)) {
    mkdirp.sync(BATTLEHACK_PATH);
}

export const BATTLEHACK_MAPS = path.join(BATTLEHACK_PATH, 'maps');
export const BATTLEHACK_SAVES = path.join(BATTLEHACK_PATH, 'saves');
export const BATTLEHACK_CREDENTIALS = path.join(BATTLEHACK_PATH, 'credentials.json');