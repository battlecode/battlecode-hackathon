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
import * as http from 'http';
import * as ws from 'ws';

const DEFAULT_MAP: MapData = {
    height: 36,
    width: 36,
    tiles: [
        ['D','D','D','G','D','D','D','D','D','D','G','D','D','D','D','G','D','D','D','D','D','D','G','D','D','D','D','G','D','D','D','D','D','D','G','D'],
        ['D','D','D','G','D','D','D','D','D','D','G','D','D','D','D','G','D','D','D','D','D','D','G','D','D','D','D','G','D','D','D','D','D','D','G','D'],
        ['D','D','G','D','D','D','D','D','D','D','G','D','D','D','G','D','D','D','D','D','D','D','G','D','D','D','G','D','D','D','D','D','D','D','G','D'],
        ['G','G','D','D','D','D','D','D','D','D','G','D','G','G','D','D','D','D','D','D','D','D','G','D','G','G','D','D','D','D','D','D','D','D','G','D'],
        ['D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D'],
        ['D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D'],
        ['D','D','D','D','D','G','G','D','D','D','D','D','D','D','D','D','D','G','G','D','D','D','D','D','D','D','D','D','D','G','G','D','D','D','D','D'],
        ['D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D'],
        ['D','G','D','D','D','D','D','D','D','D','G','G','D','G','D','D','D','D','D','D','D','D','G','G','D','G','D','D','D','D','D','D','D','D','G','G'],
        ['D','G','D','D','D','D','D','D','D','G','D','D','D','G','D','D','D','D','D','D','D','G','D','D','D','G','D','D','D','D','D','D','D','G','D','D'],
        ['D','G','D','D','D','D','D','D','G','D','D','D','D','G','D','D','D','D','D','D','G','D','D','D','D','G','D','D','D','D','D','D','G','D','D','D'],
        ['D','G','D','D','D','D','D','D','G','D','D','D','D','G','D','D','D','D','D','D','G','D','D','D','D','G','D','D','D','D','D','D','G','D','D','D'],
        ['D','D','D','G','D','D','D','D','D','D','G','D','D','D','D','G','D','D','D','D','D','D','G','D','D','D','D','G','D','D','D','D','D','D','G','D'],
        ['D','D','D','G','D','D','D','D','D','D','G','D','D','D','D','G','D','D','D','D','D','D','G','D','D','D','D','G','D','D','D','D','D','D','G','D'],
        ['D','D','G','D','D','D','D','D','D','D','G','D','D','D','G','D','D','D','D','D','D','D','G','D','D','D','G','D','D','D','D','D','D','D','G','D'],
        ['G','G','D','D','D','D','D','D','D','D','G','D','G','G','D','D','D','D','D','D','D','D','G','D','G','G','D','D','D','D','D','D','D','D','G','D'],
        ['D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D'],
        ['D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D'],
        ['D','D','D','D','D','G','G','D','D','D','D','D','D','D','D','D','D','G','G','D','D','D','D','D','D','D','D','D','D','G','G','D','D','D','D','D'],
        ['D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D'],
        ['D','G','D','D','D','D','D','D','D','D','G','G','D','G','D','D','D','D','D','D','D','D','G','G','D','G','D','D','D','D','D','D','D','D','G','G'],
        ['D','G','D','D','D','D','D','D','D','G','D','D','D','G','D','D','D','D','D','D','D','G','D','D','D','G','D','D','D','D','D','D','D','G','D','D'],
        ['D','G','D','D','D','D','D','D','G','D','D','D','D','G','D','D','D','D','D','D','G','D','D','D','D','G','D','D','D','D','D','D','G','D','D','D'],
        ['D','G','D','D','D','D','D','D','G','D','D','D','D','G','D','D','D','D','D','D','G','D','D','D','D','G','D','D','D','D','D','D','G','D','D','D'],
        ['D','D','D','G','D','D','D','D','D','D','G','D','D','D','D','G','D','D','D','D','D','D','G','D','D','D','D','G','D','D','D','D','D','D','G','D'],
        ['D','D','D','G','D','D','D','D','D','D','G','D','D','D','D','G','D','D','D','D','D','D','G','D','D','D','D','G','D','D','D','D','D','D','G','D'],
        ['D','D','G','D','D','D','D','D','D','D','G','D','D','D','G','D','D','D','D','D','D','D','G','D','D','D','G','D','D','D','D','D','D','D','G','D'],
        ['G','G','D','D','D','D','D','D','D','D','G','D','G','G','D','D','D','D','D','D','D','D','G','D','G','G','D','D','D','D','D','D','D','D','G','D'],
        ['D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D'],
        ['D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D'],
        ['D','D','D','D','D','G','G','D','D','D','D','D','D','D','D','D','D','G','G','D','D','D','D','D','D','D','D','D','D','G','G','D','D','D','D','D'],
        ['D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D','D'],
        ['D','G','D','D','D','D','D','D','D','D','G','G','D','G','D','D','D','D','D','D','D','D','G','G','D','G','D','D','D','D','D','D','D','D','G','G'],
        ['D','G','D','D','D','D','D','D','D','G','D','D','D','G','D','D','D','D','D','D','D','G','D','D','D','G','D','D','D','D','D','D','D','G','D','D'],
        ['D','G','D','D','D','D','D','D','G','D','D','D','D','G','D','D','D','D','D','D','G','D','D','D','D','G','D','D','D','D','D','D','G','D','D','D'],
        ['D','G','D','D','D','D','D','D','G','D','D','D','D','G','D','D','D','D','D','D','G','D','D','D','D','G','D','D','D','D','D','D','G','D','D','D']
    ],
    sector_size: 10,
};
for (let i = 0; i < 10; i++) {
    DEFAULT_MAP.tiles[i][i] = 'D';
}
const DEFAULT_ENTITIES: EntityData[] = [
    {id: 0, type: "statue", location: {x:1,y:0}, team: 1, hp: 10},
    {id: 1, type: "statue", location: {x:10,y:11}, team: 2, hp: 10},
    {id: 2, type: "hedge", location: {x:1,y:2}, team: 0, hp: 100},
    {id: 3, type: "hedge", location: {x:2,y:2}, team: 0, hp: 100},
    {id: 4, type: "hedge", location: {x:3,y:2}, team: 0, hp: 100},
    {id: 5, type: "hedge", location: {x:10,y:9}, team: 0, hp: 100},
    {id: 6, type: "hedge", location: {x:9,y:9}, team: 0, hp: 100},
    {id: 7, type: "hedge", location: {x:8,y:9}, team: 0, hp: 100},
    {id: 8, type: "thrower", location: {x:3,y:3}, team: 1, hp: 10},
    {id: 9, type: "thrower", location: {x:8,y:8}, team: 2, hp: 10},
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
        console.log(client.id + " |");
        if (this.listeners.has(client.id)) {
            throw new Error("Client already in game: "+client.id);
        }
        this.listeners.set(client.id, client);
        client.onCommand(this.handleCommand.bind(this));
        client.onClose(this.handleClose.bind(this));

        if (this.players.size == 2 && this.listeners.size == 3) {
            this.startGame();
        }
    }

    handleCommand(command: IncomingCommand, client: Client) {
        if (command.command === 'login' && this.state.state === 'setup') {
            if (this.players.has(client.id)) {
                throw new Error("Can't log in twice!");
            }

            // simple way to assign a consecutive team to every player
            const team = {
                id: this.state.nextTeamID,
                name: command.name
            };
            this.state.teams.set(client.id, team);
            this.players.set(client.id, team.id);
            this.state.nextTeamID++;

            let confirmation: LoginConfirm = {
                command: "login_confirm",
                id: team.id,
                name: team.name,
            };
            client.send(confirmation);

            //if (this.players.size >= 2) {
            //    this.startGame();
            //}

            if (this.players.size == 2 && this.listeners.size == 3) {
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

        let diff = this.state.game.addInitialEntitiesAndSectors(DEFAULT_ENTITIES);
        this.handleDiff(diff);
    }

    handleClose(client: Client) {
        if (this.players.has(client.id)) {
            throw new Error("Player disconnected: ");
        }

        this.listeners.delete(client.id);

        console.log(client.id + ' X');
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

console.log('tcp listening on :6172');
let tcpServer = new net.Server((socket) => {
    const client = Client.fromTCP(socket);
    gameRunner.addClient(client);
});
tcpServer.listen(6172);

console.log('ws listening on :6173');
let httpServer = new http.Server();
let wsServer = new ws.Server({ server: httpServer });
wsServer.on('connection', (socket) => {
    gameRunner.addClient(Client.fromWeb(socket));
});
httpServer.listen(6173);

console.log('ready.');

