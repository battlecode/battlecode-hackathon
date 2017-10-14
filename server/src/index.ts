import {
    EntityData,
    IncomingCommand,
    LoginConfirm,
    MapData,
    MapTile,
    NextTurn,
    NEUTRAL_TEAM,
    OutgoingCommand,
    TeamData,
    TeamID,
} from './schema';
import { Game } from './game';
import { Client, ClientID } from './client';
import * as net from 'net';
import * as ws from 'ws';

const DEFAULT_MAP: MapData = {
    height: 20,
    width: 20,
    tiles: Array(20).fill(Array(20).fill('G')),
    sector_size: 10,
};
const DEFAULT_ENTITIES: EntityData[] = [
    {id: 0, type: "thrower", location: {x:0,y:0}, team: 1, hp: 10},
    {id: 1, type: "thrower", location: {x:19,y:19}, team: 2, hp: 10},
    {id: 2, type: "hedge", location: {x: 1, y: 1}, team: 0, hp: 100},
    {id: 3, type: "hedge", location: {x: 18, y: 18}, team: 0, hp: 100},
];
class GameRunner {
    listeners: Map<ClientID, Client>;
    players: Map<ClientID, TeamID>;
    state: { state: "setup", teams: Map<ClientID, TeamData>, nextTeamID: number } |
           { state: "play", game: Game };

    constructor() {
        this.listeners = new Map();
        this.players = new Map();
        this.state = { state: 'setup', teams: new Map(), nextTeamID: 1 };
    }

    addClient(client: Client) {
        if (this.listeners.has(client.id)) {
            throw new Error("Client already in game: "+client.id);
        }
        this.listeners.set(client.id, client);
        client.onCommand(this.handleCommand.bind(this));
        client.onClose(this.handleClose.bind(this));
    }

    handleCommand(command: IncomingCommand, client: Client) {
        console.log(command);
        if (command.command === 'login' && this.state.state === 'setup') {
            if (this.players.has(client.id)) {
                throw new Error("Can't log in twice!");
            }

            // simple way to assign a consecutive team to every player
            this.players.set(client.id, this.players.size);
            this.state.teams.set(client.id, {
                id: this.state.nextTeamID,
                name: command.name
            });
            this.state.nextTeamID++;

            let confirmation: LoginConfirm = {
                command: "login_confirm",
                name: command.name,
                id: this.players.get(client.id) as number
            };
            client.send(confirmation);

            if (this.players.size >= 2) {
                this.startGame();
            }
        } else if (command.command === 'make_turn' && this.state.state === 'play') {
            const teamID = this.players.get(client.id);
            if (teamID === undefined) {
                throw new Error("non-player client can't make turn: "+client.id);
            }
            const diff = this.state.game.makeTurn(teamID, command.actions);
            this.handleDiff(diff);
        } else {
            throw new Error("Invalid command!");
        }
    }

    startGame() {
        if (this.state.state !== "setup") {
            throw new Error("Game already running!");
        }

        let teams: TeamData[] = Array.from(this.state.teams.values());
        // add the neutral team
        teams.push(NEUTRAL_TEAM);
        teams.sort((a,b) => a.id - b.id);

        this.broadcast({
            command: 'start',
            map: DEFAULT_MAP,
            teams: teams
        });
        this.state = {
            state: 'play',
            game: new Game(DEFAULT_MAP, teams)
        }

        let diff = this.state.game.addInitialEntitiesAndSectors([
        ]);
        this.handleDiff(diff);
    }

    handleClose(client: Client) {
        if (this.players.has(client.id)) {
            throw new Error("Player disconnected: ");
        }

        this.listeners.delete(client.id);
    }

    broadcast(command: OutgoingCommand) {
        this.listeners.forEach((client) => {
            // TODO only serialize once
            client.send(command);
        });
    }

    handleDiff(diff: NextTurn) {
        if (this.state.state == "setup") throw new Error("Can't broadcast diff in setup");

        this.broadcast(diff);
    }
}

const gameRunner = new GameRunner();

let tcpServer = new net.Server((socket) => {
    const client = Client.fromTCP(socket);
    gameRunner.addClient(client);
});

console.log('ws listening on :6173');
let wsServer = new ws.Server({ port: 8080 });
wsServer.on('connection', (socket) => {
    gameRunner.addClient(Client.fromWeb(socket));
});

console.log('tcp listening on :6172');
tcpServer.listen(6172);
console.log('ready.');

