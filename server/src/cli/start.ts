/**
 * This file is a command module that can be used by yargs (see https://github.com/yargs/yargs).
 * 
 * It handles running the viewer and server.
 */
import Server from '../index';
import * as statik from 'node-static';
import * as http from 'http';
import * as open from 'opn';
import { spawn } from 'child_process';
import chalk from 'chalk';
import * as yargs from 'yargs';
import * as path from 'path';

export const command = 'start';
export const describe = 'Run the game'
export const builder = <any>{
    'tcpPort': {
        default: 6147,
        describe: 'TCP port to host games on',
        type: 'number'
    },
    'wsPort': {
        default: 6148,
        describe: 'Websocket port to host games on',
        type: 'number'
    },
    'unixSocket': {
        default: /^win/.test(process.platform) ? undefined : '/tmp/battlecode.sock',
        describe: 'Unix raw socket to host games on',
        type: 'string'
    },
    'viewer': {
        default: true,
        describe: 'Run the viewer',
        type: 'boolean'
    },
    'viewerPort': {
        default: 8080,
        describe: 'Port to host the viewer on',
        type: 'number'
    },
    'viewerOpen': {
        default: true,
        describe: 'Open the viewer automatically (--no-viewer to disable)',
        type: 'boolean'
    },
    'viewerDev': {
        default: false,
        describe: 'Run viewer from adjacent development directory',
        type: 'boolean'
    },
    'serverKey': {
        describe: 'server password',
        type: 'string'
    }
};

export const handler = (options) => {
    console.log(chalk.magenta(
`    __          __  __  __     __               __
   / /_  ____ _/ /_/ /_/ /__  / /_  ____ ______/ /__
  / __ \\/ __ \`/ __/ __/ / _ \\/ __ \\/ __ \`/ ___/ //_/
 / /_/ / /_/ / /_/ /_/ /  __/ / / / /_/ / /__/ ,<
/_.___/\\__,_/\\__/\\__/_/\\___/_/ /_/\\__,_/\\___/_/|_|`));
    console.log(chalk.blue('===================================================='));

    const engineLog = s => console.log(`[${chalk.magenta('engine')}]`, s);
    const engineError = s => console.log(`[${chalk.magenta('engine-error')}]`, chalk.red(s));

    engineLog('Starting the game engine...');

    let server = new Server({
        tcpPort: options.tcpPort,
        wsPort: options.wsPort,
        unixSocket: options.unixSocket,

        debug: options.debug,
        log: engineLog,
        error: engineError
    });

    server.start();

    const viewerLog = s => console.log(`[${chalk.blue('viewer')}]`, s);
    const viewerError = s => console.log(`[${chalk.blue('viewer-error')}]`, chalk.red(s));

    // we're in dist/src/cli/
    const distDir = path.dirname(path.dirname(__dirname));

    if (options.viewer) {
        if (options.viewerDev) {
            viewerLog('Running viewer in debug mode...');
            let prefix = path.join(
                path.dirname(path.dirname(distDir)),
                'viewer'
            );
            viewerLog(`$ npm start --prefix ${prefix}`)
            let proc = spawn('npm', ['start', '--prefix', prefix]);

            proc.stdout.on('data', data => viewerLog(data.toString()));
            proc.stderr.on('data', data => viewerError(data.toString()));
            proc.on('close', (code, sig) => {
                viewerError(`Viewer closed with code ${code}, sig ${sig}`);
            });
            process.on('exit', () => {
                proc.kill();
            });
        } else {
            viewerLog(`Serving viewer at localhost:${options.viewerPort}...`)

            const viewerDir = path.join(distDir, 'viewer');

            var fileServer = new statik.Server(viewerDir, {
                indexFile: path.join(viewerDir, 'index.html')
            });
            
            http.createServer((request, response) => {
                request.addListener('end', () => {
                    fileServer.serve(request, response, () => 0);
                }).resume();
            }).listen(8080);

            if (options.viewerOpen) {
                viewerLog(`Opening http://localhost:${options.viewerPort}/ in your browser...`);
                open(`http://localhost:${options.viewerPort}/`, (err) => {
                    viewerError('Failed to open viewer in your browser.');
                    viewerLog(`Please open http://localhost:${options.viewerPort}/ in your browser.`);
                });
            } else {
                viewerLog(`Please open http://localhost:${options.viewerPort}/ in your browser.`);
            }
        }
    }

    setTimeout(
        () => console.log(chalk.blue('\n\tLeave this terminal running while you play. Ctrl-C to exit.\n')),
        2000
    );
}