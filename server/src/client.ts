import { Packet } from '_debugger';
import { IncomingCommand, LoginConfirm, OutgoingCommand, TeamData, TeamID, MapFile } from './schema';

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
        });
    }

    /**
     * Efficiently send a command to a list of clients.
     */
    static sendToAll(command: OutgoingCommand, clients: Client[]) {
        const serialized = JSON.stringify(command);
        for (let client of clients) {
            // console.log(client.id + " < " + serialized);
            client.sendString(serialized);
        }
    }

    private constructor(socket: SocketEnum) {
        this.id = uuid();
        this.socket = socket;

        let errorCb = (err: Error) => {
            console.log("error with client "+this.id);
            if (err) {
                console.log(err.stack);
            } else {
                console.log("???")
            }
        }
        if (this.socket.type == "tcp") {
            this.socket.tcp.on('error', errorCb);
        } else {
            this.socket.web.on('error', errorCb);
        }
    }

    /**
     * @param callback called when command received
     */
    onCommand(callback: (command: IncomingCommand, client: Client) => void) {
        let cb = (data: string | Buffer) => {
            let command;
            try {
                command = validateIncoming(data);
            } catch (e) {
                this.send({
                    command: "error",
                    reason: "failed to parse command: "+data
                });
                return;
            }
            //console.log(this.id + " > "+JSON.stringify(command));
            callback(command, this);
        };
        if (this.socket.type === 'tcp') {
            this.socket.byline.on('data', cb);
        } else {
            this.socket.web.on('message', cb);
        }
    }

    onClose(callback: (client: Client) => void) {
        if (this.socket.type === 'tcp') {
            // note: add callback to tcp and not byline
            this.socket.tcp.on('close', () => callback(this));
        } else {
            this.socket.web.on('close', () => callback(this));
        }
    }

    send(command: OutgoingCommand) {
        // console.log(this.id + " < " + JSON.stringify(command));
        this.sendString(JSON.stringify(command));
    }

    private sendString(command: string) {
        if (this.socket.type === 'tcp') {
            this.socket.tcp.write(command);
            this.socket.tcp.write('\n');
        } else {
            // no need to split commands manually with websockets
            this.socket.web.send(command);
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