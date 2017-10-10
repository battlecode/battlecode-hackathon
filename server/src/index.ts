import { IncomingCommand, LoginConfirm, OutgoingCommand, TeamData, TeamID, MapData } from './schema';
import { Game, TurnDiff } from './game';
import { Client, ClientID } from './client';
import * as net from "net";
import * as ws from "ws";

class GameRunner {
    listeners: Map<ClientID, Client>;
    players: Map<ClientID, TeamID>;
    state: { state: "setup", names: Map<ClientID, string> } | { state: "play", game: Game };

    constructor() {
        this.listeners = new Map();
        this.players = new Map();
        this.state = { state: 'setup', names: new Map() };
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
        if (command.command === 'login' && this.state.state === 'setup') {
            if (this.players.has(client.id)) {
                throw new Error("Can't log in twice!");
            }

            // simple way to assign a consecutive team to every player
            this.players.set(client.id, this.players.size);
            this.state.names.set(client.id, command.name);

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
        let map: MapData = {
            height: 3,
            width: 3,
            sector_size: 1,
            tiles: [
                ['D', 'G', 'G'],
                ['G', 'D', 'G'],
                ['G', 'G', 'D']
            ]
        };

        let teams: TeamData[] = [];
        for (const [clientID, teamID] of this.players) {
            const name = this.state.names.get(clientID);
            if (name === undefined) {
                throw new Error("Team with no name?? "+name);
            }
            teams[teamID] = {
                id: teamID,
                name: name
            };
        }

        this.broadcast({
            command: 'start',
            map: map,
            teams: teams
        });
        this.state = {
            state: 'play',
            game: new Game(map, teams)
        }

        let diff = this.state.game.addInitialEntities([
            {id: 0, type: "thrower", location: {x:0,y:0}, team: 0, hp: 10},
            {id: 1, type: "thrower", location: {x:2,y:2}, team: 1, hp: 10},
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

    handleDiff(diff: TurnDiff) {
        if (this.state.state == "setup") throw new Error("Can't broadcast diff in setup");

        this.broadcast({
            command: "next_turn",
            changed: diff.dirty,
            dead: diff.dead,

            successful: diff.successfulActions,
            failed: diff.failedActions,
            reasons: diff.reasons,

            next_team: this.state.game.nextTeam
        });
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

