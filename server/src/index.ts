import {
    CreateGame,
    EntityData,
    GameStart,
    GameID,
    GameReplay,
    IncomingCommand,
    Login,
    LoginConfirm,
    MakeTurn,
    MapFile,
    MapTile,
    MatchData,
    NEUTRAL_TEAM,
    NextTurn,
    OutgoingCommand,
    PlayerKey,
    TeamData,
    SpectateAll,
    TeamID,
} from './schema';

import ClientError from './error';
import { Game } from './game';
import { Client, ClientID } from './client';
import * as net from 'net';
import * as http from 'http';
import * as ws from 'ws';
import * as zlib from 'zlib';
import { promisify } from 'util';
import * as uuid from 'uuid/v4';
import * as fs from 'fs';
import * as _ from 'lodash';

const gzip = <(string) => Promise<Buffer>>promisify(zlib.gzip);

const DEFAULT_MAP: MapFile = {
    version: "battlecode 2017 hackathon map",
    name: "default",
    teamCount: 2,
    height: 12,
    width: 12,
    tiles: [
        ['D','D','D','G','D','D','D','D','D','D','G','D'],
        ['D','D','D','G','D','D','D','D','D','D','G','D'],
        ['D','D','G','D','D','D','D','D','D','D','G','D'],
        ['G','G','D','D','D','D','D','D','D','D','G','D'],
        ['D','D','D','D','D','D','D','D','D','D','D','D'],
        ['D','D','D','D','D','D','D','D','D','D','D','D'],
        ['D','D','D','D','D','G','G','D','D','D','D','D'],
        ['D','D','D','D','D','D','D','D','D','D','D','D'],
        ['D','G','D','D','D','D','D','D','D','D','G','G'],
        ['D','G','D','D','D','D','D','D','D','G','D','D'],
        ['D','G','D','D','D','D','D','D','G','D','D','D'],
        ['D','G','D','D','D','D','D','D','G','D','D','D'],
    ],
    sectorSize: 2,
    entities: [
        {id: 0, type: "statue", location: {x:1,y:0}, teamID: 1, hp: 10},
        {id: 1, type: "statue", location: {x:10,y:11}, teamID: 2, hp: 10},
        {id: 2, type: "hedge", location: {x:1,y:2}, teamID: 0, hp: 100},
        {id: 3, type: "hedge", location: {x:2,y:2}, teamID: 0, hp: 100},
        {id: 4, type: "hedge", location: {x:3,y:2}, teamID: 0, hp: 100},
        {id: 5, type: "hedge", location: {x:10,y:9}, teamID: 0, hp: 100},
        {id: 6, type: "hedge", location: {x:9,y:9}, teamID: 0, hp: 100},
        {id: 7, type: "hedge", location: {x:8,y:9}, teamID: 0, hp: 100},
        {id: 8, type: "thrower", location: {x:3,y:3}, teamID: 1, hp: 10},
        {id: 9, type: "thrower", location: {x:8,y:8}, teamID: 2, hp: 10},
    ]
};

/**
 * Represents a game that hasn't started yet.
 */
class Lobby {
    /**
     * The ID of this game.
     */
    id: GameID;

    /**
     * The teams passed in the 'create_game' message.
     */
    requiredTeams: TeamData[];

    /**
     * The map the game will be played on.
     */
    map: MapFile;

    /**
     * The connected players.
     */
    playerTeams: [Client, TeamData][];

    /**
     * Clients that care about the end of this game.
     */
    onEnd: Client[];

    constructor(id: GameID, create: CreateGame, client?: Client) {
        this.id = id;

        if (typeof create.map === "string") {
            throw new Error("server map listing unimplemented");
        } else {
            this.map = create.map;
        }

        if (create.teams) {
            this.requiredTeams = create.teams;
        } else {
            this.requiredTeams = [];
            for (let i = 0; i < this.map.teamCount; i++) {
                this.requiredTeams.push({
                    teamID: i+1,
                    // will be overwritten by login since key is not set
                    name: "UNKNOWN",
                });
            }
        }

        this.playerTeams = []
        this.onEnd = [];
        if (client && create.sendReplay) {
            this.onEnd.push(client);
        }
    }

    /**
     * Handle a login message.
     */
    login(login: Login, client: Client): GameRunner | undefined {
        for (let [client_, team] of this.playerTeams) {
            if (client_.id == client.id) {
                throw new ClientError("client already connected!");
            }
        }

        for (let i = 0; i < this.requiredTeams.length; i++) {
            const requiredTeam = this.requiredTeams[i];
            if (login.key !== requiredTeam.key) {
                continue;
            }
            // TODO override on server
            let newTeam = {
                name: login.name,
                teamID: requiredTeam.teamID
            };
            // assign player to team
            this.playerTeams.push([client, newTeam]);
            this.requiredTeams.splice(i, 1);

            let confirmation: LoginConfirm = {
                command: "loginConfirm",
                gameID: this.id,
                teamID: newTeam.teamID,
            };
            client.send(confirmation);

            if (this.requiredTeams.length == 0) {
                return new GameRunner(this.id, this.map, this.playerTeams, this.onEnd);
            } else {
                return undefined;
            }
        }
        if (login.key) {
            throw new ClientError("incorrect key: "+login.key);
        } else {
            throw new Error("lobby already full?");
        }
    }

    deleteClient(id: ClientID): boolean {
        for (let i = 0; i < this.playerTeams.length; i++) {
            if (this.playerTeams[i][0].id == id) {
                // client was playing, we need to shutdown now
                return true;
            }
        }
        for (let i = 0; i < this.onEnd.length; i++) {
            if (this.onEnd[i].id == id) {
                this.onEnd.splice(i, 1);
            }
        }
        return false;
    }
}

class GameRunner {
    id: GameID;
    playerClients: Client[];
    players: Map<ClientID, TeamID>;
    game: Game;
    pastTurns: NextTurn[];
    onEnd: Client[];
    started: boolean;
    winner?: TeamData;

    constructor(id: GameID, map: MapFile, playerTeams: [Client, TeamData][], onEnd: Client[]) {
        this.id = id;
        this.playerClients = [];
        this.players = new Map();
        const teams: TeamData[] = [];
        for (let [client, team] of playerTeams) {
            this.playerClients.push(client);
            this.players.set(client.id, team.teamID);
            teams.push(team);
        }
        teams.push(NEUTRAL_TEAM);
        // ensure teams are sorted
        teams.sort((a,b) => a.teamID - b.teamID);

        this.game = new Game(id, map, teams);
        this.onEnd = onEnd;
        this.pastTurns = [];
        this.started = false;
    }

    async broadcast(command: OutgoingCommand) {
        // add to our listeners
        Client.sendToAll(command, this.playerClients);
        // send to global spectators
        Client.sendToAll(command, spectators);
    }

    async addSpectator(spectator: Client) {
        if (this.started) {
            // note: client may start receiving turns before they receive the replay
            // that's fine, they just need to store them somewhere
            const replay = await this.makeReplay()
            spectator.send(replay);
        }
    }

    async start() {
        const start: GameStart = {
            command: "start",
            gameID: this.id,
            initialState: this.game.initialState,
            teams: this.game.teams
        };
        await this.broadcast(start);
        this.started = true;
        const firstTurn = this.game.firstTurn();
        await this.broadcast(firstTurn);
    }

    async makeTurn(turn: MakeTurn, client: Client) {
        const teamID = this.players.get(client.id);
        if (teamID === undefined) {
            throw new ClientError("non-player client can't make turn: "+client.id);
        }
        const nextTurn = this.game.makeTurn(teamID, turn.previousTurn, turn.actions);

        await this.broadcast(nextTurn);

        this.pastTurns.push(nextTurn);

        if (nextTurn.winnerID) {
            this.winner = this.game.teams[nextTurn.winnerID];
        }
    }

    async makeReplay(): Promise<GameReplay> {
        let gzipped = await this.makeGzippedMatchData();
        const base64 = gzipped.toString('base64');

        return {
            command: "gameReplay",
            matchData: base64,
            id: this.id
        }
    }

    async makeGzippedMatchData(): Promise<Buffer> {
        const soFar: MatchData = {
            version: "battlecode 2017 hackathon match",
            initialState: this.game.initialState,
            gameID: this.id,
            teams: this.game.teams,
            turns: this.pastTurns,
            winner: this.winner ? this.winner.teamID : undefined
        };

        // TODO: do this in another process so we don't block running games?
        const json = JSON.stringify(soFar);
        return gzip(json);
    }

    // returns whether the game should be cancelled because the client shutdown
    deleteClient(id: ClientID): boolean {
        if (this.players.has(id)) {
            // client was playing, we need to shutdown now
            return true;
        }
        for (let i = 0; i < this.onEnd.length; i++) {
            if (this.onEnd[i].id === id) {
                this.onEnd.splice(i, 1);
                break;
            }
        }
        return false;
    }

}

// TODO: this is fairly jank?
const handleCommand = async (command: IncomingCommand, client: Client) => {
    try {
        switch (command.command) {
        case "login":
            await handleLogin(command, client);
            break;
        case "makeTurn":
            await handleMakeTurn(command, client);
            break;
        case "spectateAll":
            await handleSpectateAll(command, client);
            break;
        case "createGame":
            await handleCreateGame(command, client);
            break;
        default:
            client.send({
                command: "error",
                reason: "unimplemented command: "+command.command
            })
        }
    } catch (e) {
        console.log('hit error')
        if (e instanceof ClientError) {
            // their fault
            client.send({
                command: "error",
                reason: e.message
            });
        } else if (e instanceof Error) {
            // our fault
            client.send({
                command: "error",
                reason: "internal server error: "+e.message
            });
            console.error("internal server error:", e.stack);
        } else {
            // still our fault
            client.send({
                command: "error",
                reason: "internal server error: "+JSON.stringify(e)
            });
            console.error("internal server error:", JSON.stringify(e));
        }
    }
}

const handleClose = async (client: Client) => {
    try {
        for (let game of games.values()) {
            let broken = game.deleteClient(client.id);
            if (broken) {
                console.log("ending game "+game.id);
                games.delete(game.id);
                if (game.id === pickupLobbyID) {
                    pickupLobbyID = undefined;
                }
            }
        }
    } catch (e) {
        if (e instanceof ClientError) {
            // their fault
            client.send({
                command: "error",
                reason: e.message
            });
        } else if (e instanceof Error) {
            // our fault
            client.send({
                command: "error",
                reason: "internal server error: "+e.message
            });
            console.error("internal server error:", e.stack);
        } else {
            // still our fault
            client.send({
                command: "error",
                reason: "internal server error: "+JSON.stringify(e)
            });
            console.error("internal server error:", JSON.stringify(e));
        }
    }
};

const games: Map<GameID, Lobby | GameRunner> = new Map();
const playing: Map<ClientID, GameID> = new Map();
// the id of
let pickupLobbyID: GameID | undefined;
let spectators: Client[] = [];

const handleLogin = async (login: Login, client: Client) => {
    let gameID;
    if (login.gameID) {
        gameID = login.gameID;
    } else {
        if (pickupLobbyID === undefined) {
            let pickup = new Lobby(
                uuid(),
                {
                    command: "createGame",
                    map: DEFAULT_MAP,
                    sendReplay: false
                }
            );
            games.set(pickup.id, pickup);
            pickupLobbyID = pickup.id;
        }
        gameID = pickupLobbyID;
    }
    const game = games.get(gameID);
    if (game === undefined) {
        throw new ClientError("no such game: "+login.gameID);
    }
    if (game instanceof GameRunner) {
        throw new ClientError("game already running: "+login.gameID);
    } 
    let runner = game.login(login, client);
    playing.set(client.id, game.id);

    if (runner) {
        // Lobby has converted into GameRunner
        games.set(runner.id, runner);
        runner.start();
        if (runner.id === pickupLobbyID) {
            pickupLobbyID = undefined;
        }
    }
}

const handleMakeTurn = async (makeTurn: MakeTurn, client: Client) => {
    let gameID = playing.get(client.id);
    if (gameID === undefined) {
        throw new ClientError("client not playing a game");
    }
    let game = games.get(gameID);
    if (!game) {
        throw new Error("internal server error, no such game?: "+gameID);
    }
    if (game instanceof Lobby) {
        throw new ClientError("game hasn't started yet")
    }
    await game.makeTurn(makeTurn, client);
    if (game.winner) {
        let time = Date.now();
        let replay = await game.makeGzippedMatchData();
        console.log("save time: "+(Date.now() - time) + 'ms');
        fs.writeFileSync(`match-${gameID}.bch18`, replay);
    }
}

const handleSpectateAll = async (spectateAll: SpectateAll, client: Client) => {
    spectators.push(client);
    for (let game of games.values()) {
        if (game instanceof GameRunner) {
            await game.addSpectator(client);
        }
    }
}

const handleCreateGame = async (createGame: CreateGame, client: Client) => {
    let lobby = new Lobby(uuid(), createGame, client);
    games.set(lobby.id, lobby);
}

console.log('tcp listening on :6147');
const cb = (socket) => {
    const client = Client.fromTCP(socket);
    console.log(client.id + " |");
    client.onCommand(handleCommand);
    client.onClose(handleClose);
};
let tcpServer = new net.Server(cb);
tcpServer.listen(6147);

console.log('unix listening on /tmp/battlecode.sock');
if (fs.existsSync('/tmp/battlecode.sock')) {
    fs.unlinkSync('/tmp/battlecode.sock');
}
let unixServer = new net.Server(cb);
unixServer.listen('/tmp/battlecode.sock');

console.log('ws listening on :6148');
let httpServer = new http.Server();
let wsServer = new ws.Server({ server: httpServer });
wsServer.on('connection', (socket) => {
    const client = Client.fromWeb(socket);
    console.log(client.id + " |");
    client.onCommand(handleCommand);
    client.onClose(handleClose);
});
httpServer.listen(6148);

console.log('ready.');
