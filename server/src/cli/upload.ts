import * as https from 'https';
import * as _read from 'read';
import axios from 'axios';
import { promisify } from 'util';
import chalk from 'chalk';
import * as fs from 'fs';
import * as paths from '../paths';
import * as querystring from 'querystring';
import * as path from 'path';
import readdirRecursive from '../readdirrecursive';
import * as tar from 'tar';
import * as uuid from 'uuid/v4';

// broken typings
const ignore = require('ignore');

const read = (opts): Promise<string> => new Promise((resolve, reject) => {
    _read(opts, (err, result) => {
        if (err) {
            reject(err);
        } else {
            resolve(result);
        }
    });
});

export const command = 'upload';
export const describe = 'Upload a bot to the battlehack servers'
export const builder = <any>{
    'name': {
        default: undefined,
        describe: 'Name to give the bot',
        type: 'string'
    }
};

const SERVER = 'http://battlehack.mit.edu/'
/**
 * The ID of this client.
 */
const CLIENT_ID = 'YmF0dGxlY29kZXdlYmFwcDpKQlVZOVZFNjkyNDNCWUM5MDI0Mzg3SEdWWTNBUUZL';

interface Credentials {
    expires: number,
    token: string
}

const log = (msg: string) => {
    console.log(`[${chalk.blue('upload')}] ${msg}`);
}
const error = (msg: string) => {
    console.error(`[${chalk.blue('upload-error')}] ${chalk.red(msg)}`);
}

const getCredentials = async (): Promise<Credentials> => {
    while (true) {
        if (!fs.existsSync(paths.CREDENTIALS)) {
            /**
             * This is fairly insecure. However, we store credentials in the filesystem anyway,
             * so...
             */
            log("Please enter your website login information:");

            let username = await read({ prompt: 'Username: ' });
            let password = await read({ prompt: 'Password: ', silent: true });
            let creds;
            try {
                creds = await axios.request({
                    method: 'POST',
                    baseURL: SERVER,
                    url: '/oauth/token',
                    headers: {
                        'Authorization': `Basic ${CLIENT_ID}`
                    },
                    data: querystring.stringify({
                        grant_type: 'password',
                        username: username,
                        password: password,
                        client_id: CLIENT_ID
                    })
                });
            } catch (e) {
                error(e.message);
                error('Did you enter your password correctly?');
                continue;
            }
            if (creds.data.error) {
                error(`Login error: ${creds.data.error}`);
                error('Did you enter your password correctly?');
                continue;
            }
            if (creds.data.access_token === undefined || creds.data.expires_in === undefined) {
                error(`Missing data; req/resp: ${creds}`);
                error(`Please report this to the devs.`)
                continue;
            }
            let {access_token, expires_in} = creds.data;
            let outCreds: Credentials = {
                token: access_token,
                expires: Math.floor(Date.now() / 1000) + expires_in
            }
            fs.writeFileSync(paths.CREDENTIALS, JSON.stringify(outCreds, undefined, 2));
            return outCreds;
        } else {
            let result = JSON.parse(fs.readFileSync(paths.CREDENTIALS).toString());
            let {token, expires} = result;

            // if we're expired, get new tokens (+ 60 seconds of leeway)

            if (Date.now() / 1000 > expires - 60) {
                fs.unlinkSync(paths.BATTLEHACK_PATH);
                // loop to the previous case
                continue;
            }
            return {token, expires};
        }
    }
}

export const handler = async (options) => {
    try {
        await _handler(options);  
    } catch (e) {
        if (e.message === 'canceled') {
            console.log();
            log('Canceling.');
        } else {
            error(`${e.stack}`);
            error(`Please report this to the devs.`);
        }
    }
}
const _handler = async (options) => {
    let credentials = await getCredentials();
    log("Logged in.");

    // collect and gzip files

    let cwd = process.cwd();

    log(`Uploading from: ${cwd}`);

    let gitignore = path.join(cwd, '.gitignore');

    if (!fs.existsSync(gitignore)) {
        log(`${chalk.red('warning')}: no .gitignore found; uploading everything`);
    } else {
        log(`Ignoring files in .gitignore`);
    }

    const ig = ignore();
    ig.add(['.git'])
    ig.add(fs.readFileSync(gitignore).toString().split(/\r?\n/));

    // POST to service with `Authorization: Bearer $credentials.token` header
    let toUpload = await readdirRecursive(cwd);
    toUpload = ig.filter(toUpload);

    log('Will upload: ');

    for (let path of toUpload) {
      log(`\t ${chalk.green(path)}`);
    }
    if (toUpload.indexOf('run.sh') === -1) {
        error('run.sh not found! Please add a run.sh as described in the battlehack docs: [link].');
        return;
    }

    log('Please review these files to make sure nothing is missing.');

    while (true) {
        let answer = await read({ prompt: 'Looks good? [y/n]: ' });
        if (answer.length === 0) {
            error('Please enter y or n');
            continue;
        }
        let c = answer.charAt(0).toLowerCase();
        if (c === 'n') {
            log('Canceling upload.');
            return;
        } else if (c === 'y') {
            break;
        } else {
            error('Please enter y or n');
            continue;
        }
    }

    let name: string;
    if (options.name === undefined) {
        log(`What should this bot be called? (Note: you can't upload two bots with the same name.)`);
        let suggested = `${path.basename(cwd)}-${uuid().slice(0,8)}`;
        let entered = await read({ prompt: `Name [default: "${suggested}"]: ` });
        if (entered.length > 0) {
            name = entered;
        } else {
            name = suggested;
        }
    } else {
        name = options.name;
    }

    log(`Bot will be uploaded as ${chalk.magenta(name)}.`);

    log('Compressing files...');

    let tarred = await new Promise<Buffer>((resolve, reject) => {
        let data = tar.create({
            portable: true,
            gzip: {
                level: 9
            }
        }, toUpload);
        let buffers = new Array<Buffer>();
        data.on('data', chunk => buffers.push(<Buffer>chunk));
        data.on('end', () => resolve(Buffer.concat(buffers)));
        data.on('error', (e) => {
            error(`${e}`);
            reject();
        });
    });
    const MAX_UPLOAD = 10000000;

    log('Finished.');

    log(`Upload size: ${chalk.magenta(formatBytes(tarred.byteLength))}`);
    if (tarred.byteLength > MAX_UPLOAD) {
        error(`Upload is too big: should be less than ${formatBytes(MAX_UPLOAD)}`);
        return;
    }

    log('Uploading...');

    let base64 = tarred.toString('base64');

    let result;
    try {
        result = await axios.request({
            method: 'POST',
            baseURL: SERVER,
            url: '/apis/submission',
            headers: {
                'Authorization': `Bearer ${credentials.token}`
            },
            data: querystring.stringify({
                label: name,
                src: base64
            })
        });
    } catch (e) {
        error(`${e}`);
        error(e.response.data);
        return;
    }
    // check that upload was successful somehow

    log('Upload finished.');

    log('Checking success...');

    try {
        result = await axios.request({
            method: 'GET',
            baseURL: SERVER,
            url: '/apis/submission/recent',
            headers: {
                'Authorization': `Bearer ${credentials.token}`
            }
        });
    } catch (e) {
        error(`${e}`);
        error(e.response.data);
        return;
    }

    if (result.data.data.label !== name) {
        error(`Most recent submission has wrong label? is "${result.data.data.label}", should be "${name}".`)
        error(`Please report this to the devs.`);
    } else {
        log(`Upload successful! Now go watch how ${chalk.magenta(name)} does `+
        `in the scrimmage queue at ${chalk.underline(SERVER + '#/matches')}`);
        try {
            let count = result.data.data.source_code.match(/\/(\d+).gzip$/)[1];
            log(`This is battlehack's ${formatCount(count)} submission.`);
        } catch (e) {}
    }
};

const SUFFIXES = [
    'B',
    'kB',
    'MB',
    'GB'
];

const formatBytes = (b: number) => {
    let scale = Math.floor(Math.log10(b) / 3);
    return `${Math.ceil(b/Math.pow(10,scale*3))}${SUFFIXES[scale]}`;
};

const formatCount = (b: string) => {
    if (b.match(/1\d$/)) {
        return b + 'th';
    }
    let last = b.charAt(b.length - 1);
    if (last === '1') {
        return b + 'st';
    } else if (last === '2') {
        return b + 'nd';
    } else if (last === '3') {
        return b + 'rd';
    } else {
        return b + 'th';
    }
}