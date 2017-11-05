import * as https from 'https';
import * as _read from 'read';
import axios from 'axios';
import { promisify } from 'util';
import chalk from 'chalk';
import * as fs from 'fs';
import * as paths from '../paths';

const read = (opts) => new Promise((resolve, reject) => {
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
        type: 'number'
    },
    'botVersion': {
        default: undefined,
        describe: 'Version for the bot',
        type: 'string'
    },
    'server': {
        default: 'https://battlecode.org/',
        describe: 'The battlecode server to upload to',
        type: 'string'
    }
};

/**
 * The ID of this client.
 */
const CLIENT_ID = 'bees';

interface Credentials {
    expires: number,
    token: string
}

const getCredentials = async (server): Promise<Credentials> => {
    while (true) {
        if (!fs.existsSync(paths.CREDENTIALS)) {
            /**
             * This is fairly insecure. However, we store credentials in the filesystem anyway,
             * so...
             */
            console.log("Please enter your website login information:");

            let username = await read({prompt: 'Username: '});
            let password = await read({prompt: 'Password: ', silent: true});

            let creds = await axios.post(`${server}token`, {
                grant_type: 'password',
                username: username,
                password: password,
                client_id: CLIENT_ID
            });
            if (creds.data.error) {
                console.log(chalk.red(`Login error: ${creds.data.error}`));
                continue;
            }
            let {token, expires_in} = creds.data;
            let outCreds: Credentials = {
                token: token,
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
    let credentials = await getCredentials(options.server);
    console.log("Logged in.");

    // collect and gzip files

    // POST to service with `Authorization: Bearer $credentials.token` header

    // check that upload was successful somehow

};