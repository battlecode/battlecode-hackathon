import { IncomingCommand, LoginConfirm, OutgoingCommand, TeamData, TeamID, WorldData } from './schema';

import * as net from 'net';
import * as byline from 'byline';
import * as WebSocket from 'ws';
import * as uuid from 'uuid/v4';

/**
 * Wrappers for incoming / outgoing sockets.
 */

/**
 * The unique ID for a client.
 * Different from a TeamID; not all clients have TeamIDs.
 * Generated with uuid().
 */
export type ClientID = string;

/**
 * An enum for different types of sockets.
 * 
 * TCP sockets have a net.Socket for sending outgoing messages
 * and a byline.Linestream for receiving incoming messages.
 */
type SocketEnum = 
    {type: 'tcp', tcp: net.Socket, byline: byline.LineStream} |
    {type: 'web', web: WebSocket};

export class Client {
    /**
     * The UUID of this client.
     * Different from TeamID: not all clients have TeamIDs.
     */
    id: ClientID;

    /**
     * The socket connected to this client.
     */
    private socket: SocketEnum;

    static fromTCP(socket: net.Socket): Client {
        return new Client({
            type: 'tcp',
            tcp: socket,
            byline: byline(socket)
        });
    }

    static fromWeb(socket: WebSocket): Client {
        return new Client({
            type: 'web',
            web: socket
        })
    }

    /**
     * Reduce validation overhead.
     * This way, the socket only has to marshal from JSON once.
     */
    private commandCallbacks: Array<(command: IncomingCommand, client: Client) => void>;

    private constructor(socket: SocketEnum) {
        this.id = uuid();

        this.socket = socket;

        if (this.socket.type === 'web') {
            this.socket.web.on('message', (data) => {
                const command = validateIncoming(data as (string | Buffer));

                for (const callback of this.commandCallbacks) {
                    // note: arrow functions preserve 'this'
                    callback(command, this);
                }
            });
        } else {
            this.socket.byline.on('data', (data) => {
                const command = validateIncoming(data);

                for (const callback of this.commandCallbacks) {
                    callback(command, this);
                }
            });
        }
    }

    /**
     * @param callback called when command received
     */
    onCommand(callback: (command: IncomingCommand) => void) {
        this.commandCallbacks.push(callback);
    }

    onClose(callback: (client: Client) => void) {
        if (this.socket.type === 'tcp') {
            this.socket.byline.on('close', () => callback(this));
        } else {
            this.socket.web.on('close', () => callback(this));
        }
    }

    send(command: OutgoingCommand) {
        if (this.socket.type === 'tcp') {
            this.socket.tcp.write(JSON.stringify(command));
            this.socket.tcp.write('\n');
        } else {
            this.socket.web.send(JSON.stringify(command));
        }
    }

    close() {
        if (this.socket.type === 'tcp') {
            this.socket.tcp.destroy();
        } else if (this.socket.type === 'web') {
            this.socket.web.close();
        }
    }
}

/**
 * TODO: actually validate
 */
const validateIncoming = (command: string | Buffer) => {
    const commandS = typeof(command) === 'string' ?
      command : command.toString();

    return JSON.parse(commandS) as IncomingCommand;
};

