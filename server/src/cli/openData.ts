import * as paths from '../paths';
import * as open from 'opn';

export const command = 'openData';
export const describe = `Open the battlecode data folder ${paths.BATTLEHACK_PATH}`;
export const builder = <any>{};

export const handler = async (options) => {
    open(paths.BATTLEHACK_PATH);
    process.exit(0);
};