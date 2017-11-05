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
import chalk from 'chalk';
import * as path from 'path';

const writeFile = promisify(fs.writeFile);
const gzip = <(s: string) => Promise<Buffer>>promisify(zlib.gzip);

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
 * TODO: this class should be combined with GameRunner somehow
 */
export class Lobby {
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

    spectators: Client[];
    debug: boolean;
    isPickup: boolean;

    constructor(id: GameID,
                create: CreateGame,
                spectators: Client[],
                debug: boolean,
                client?: Client) {
        this.id = id;
        this.debug = debug;

        // if no teams have keys, this is a pickup game
        this.isPickup = create.teams ?
            create.teams.find(t => t.key !== undefined) !== undefined
            : true;

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

        this.spectators = spectators;
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
                return new GameRunner(this.id, this.map, this.playerTeams, this.onEnd, this.spectators, this.debug);
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
        for (let i = 0; i < this.onEnd.length; i++) {
            if (this.onEnd[i].id == id) {
                this.onEnd.splice(i, 1);
            }
        }
        for (let i = 0; i < this.playerTeams.length; i++) {
            if (this.playerTeams[i][0].id == id) {
                // client was playing, we need to shutdown now
                return true;
            }
        }
        return false;
    }
}

export class GameRunner {
    id: GameID;
    playerClients: Client[];
    players: Map<ClientID, TeamID>;
    game: Game;
    pastTurns: NextTurn[];
    onEnd: Client[];
    started: boolean;
    winner?: TeamData;
    spectators: Client[];

    constructor(
        id: GameID,
        map: MapFile,
        playerTeams: [Client, TeamData][],
        onEnd: Client[],
        spectators: Client[],
        debug: boolean
    ) {
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

        this.game = new Game(id, map, teams, debug);
        this.onEnd = onEnd;
        this.pastTurns = [];
        this.started = false;
        this.spectators = spectators;
    }

    async broadcast(command: OutgoingCommand) {
        // add to our listeners
        Client.sendToAll(command, this.playerClients);
        // send to global spectators
        Client.sendToAll(command, this.spectators);
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
        const nextTurn = this.game.makeTurn(teamID, turn.turn, turn.actions);

        await this.broadcast(nextTurn);

        if (process.env.BATTLECODE_DEBUG) {
            await this.broadcast(this.game.makeKeyframe());
        }

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
        if (this.winner !== undefined) {
            // no need to cancel
            return false;
        }
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

const colors = [
    chalk.blue,
    chalk.cyan,
    chalk.green,
    chalk.magenta,
    chalk.yellow,
    chalk.blueBright,
    chalk.cyanBright,
    chalk.greenBright,
    chalk.magentaBright,
    chalk.yellowBright,
];
const prettyID = (id: string | undefined): string => {
    if (!id) return chalk.underline('unknown');
    let hash = 5381;
    let i = id.length;
    while (i) hash = (hash * 33) ^ id.charCodeAt(--i);
    return colors[Math.abs(hash) % colors.length](id.slice(0, 8));
};

export interface ServerOpts {
    tcpPort: number;
    wsPort: number;
    unixSocket: string | undefined;

    savePath: string;
    mapPath: string;

    debug: boolean;

    log: (string) => void;
    error: (string) => void;
}

export default class Server {
    games: Map<GameID, Lobby | GameRunner> = new Map();
    playing: Map<ClientID, GameID> = new Map();
    spectators: Client[] = [];

    tcp?: net.Server;
    unix?: net.Server;
    ws?: ws.Server;

    opts: ServerOpts

    log: (s: string) => void;
    error: (s: string) => void;

    constructor(opts: ServerOpts) {
        this.opts = opts;
        this.log = opts.log;
        this.error = opts.error;
    }

    start() {
        this.log(`TCP listening on :${this.opts.tcpPort}`);
        this.tcp = new net.Server((socket: net.Socket) => {
            const client = Client.fromTCP(socket);
            this.log(`Client connected via tcp: ${prettyID(client.id)}`);
            client.onCommand(this.handleCommand);
            client.onClose(this.handleClose);
        });
        this.tcp.listen(this.opts.tcpPort);

        // We're not running on windows
        if (this.opts.unixSocket) {
            this.log(`Unix raw socket listening on ${this.opts.unixSocket}`);
            if (fs.existsSync(this.opts.unixSocket)) {
                fs.unlinkSync(this.opts.unixSocket);
            }
            let unixServer = new net.Server((socket: net.Socket) => {
                const client = Client.fromTCP(socket);
                this.log(`Client connected via unix raw socket: ${prettyID(client.id)}`);
                client.onCommand(this.handleCommand);
                client.onClose(this.handleClose);
            });
            unixServer.listen(this.opts.unixSocket);
        }

        this.log(`WebSocket listening on :${this.opts.wsPort}`);
        let httpServer = new http.Server();
        this.ws = new ws.Server({ server: httpServer });
        this.ws.on('connection', (socket: ws) => {
            const client = Client.fromWeb(socket);
            this.log(`WebSocket client connected: ${prettyID(client.id)}`);
            client.onCommand(this.handleCommand);
            client.onClose(this.handleClose);
        });
        httpServer.listen(this.opts.wsPort);

        process.on('SIGINT', () => {
            this.log('Shutting down gracefully.');
            let promises = new Array<Promise<undefined>>();
            for (let game of this.games.values()) {
                if (game instanceof Lobby) {
                    this.log(`Cancelling game ${prettyID(game.id)} (not started)`);
                } else {
                    this.log(`Saving game ${prettyID(game.id)} unfinished`);
                    promises.push(this.saveGame(game));
                }
            }
            Promise.all(promises).then(() => {
                if (promises.length > 0) {
                    this.log('Done writing match files.')
                }
                process.exit(0);
            });
        });
    }

    private async saveGame(game: GameRunner) {
        let start = Date.now();
        let contents = await game.makeGzippedMatchData()
        let teamnames = game.game.teams.slice(1).map(t => t.name).join('-')
        let filename = `${teamnames}-${game.game.initialState.name}-${game.id}.bch18`;
        let filepath = path.join(this.opts.savePath, filename);
        await writeFile(filepath, contents);
        let end = Date.now();
        this.log(`Wrote ${filename} in ${Math.ceil(end - start)} ms`);
        return undefined;
    }

    private findPickupGame(): GameID {
        for (let [id, runner] of this.games.entries()) {
            if (runner instanceof Lobby) {
                return id;
            }
        }
        let pickup = new Lobby(
            uuid(),
            {
                command: "createGame",
                map: DEFAULT_MAP,
                sendReplay: false
            },
            this.spectators,
            this.opts.debug
        );
        this.games.set(pickup.id, pickup);
        this.log(`Created pickup game ${prettyID(pickup.id)} on map ${pickup.map.name}`);
        return pickup.id;
    }

    handleCommand = async (command: IncomingCommand, client: Client) => {
        try {
            switch (command.command) {
            case "login":
                await this.handleLogin(command, client);
                break;
            case "makeTurn":
                await this.handleMakeTurn(command, client);
                break;
            case "spectateAll":
                await this.handleSpectateAll(command, client);
                break;
            case "createGame":
                await this.handleCreateGame(command, client);
                break;
            default:
                client.send({
                    command: "error",
                    reason: "unimplemented command: "+command.command
                })
                this.error("unimplemented command: "+command.command);
            }
        } catch (e) {
            if (e instanceof ClientError) {
                // their fault
                client.send({
                    command: "error",
                    reason: e.message
                });
                this.error(`E`)
            } else if (e instanceof Error) {
                // our fault
                client.send({
                    command: "error",
                    reason: "Internal server error: "+e.message
                });
                this.error(`Internal server error: ${e.stack}`);
            } else {
                // still our fault
                client.send({
                    command: "error",
                    reason: "Internal server error: "+JSON.stringify(e)
                });
                this.error(`Internal server error: ${JSON.stringify(e)}`);
            }
        }
    }

    handleClose = async (client: Client) => {
        this.log(`Client disconnected: ${prettyID(client.id)}`)
        for (let game of this.games.values()) {
            let broken = game.deleteClient(client.id);
            if (broken) {
                this.log(`Ending game early: ${prettyID(game.id)}`);
                this.games.delete(game.id);
            }
        }
        for (let i = 0; i < this.spectators.length; i++) {
            if (this.spectators[i].id == client.id) {
                this.spectators.splice(i, 1);
                break;
            }
        }
    };

    handleLogin = async (login: Login, client: Client) => {
        let gameID;
        if (login.gameID) {
            gameID = login.gameID;
        } else {
            gameID = this.findPickupGame();
        }
        const game = this.games.get(gameID);
        if (game === undefined) {
            throw new ClientError(`No such game: ${prettyID(login.gameID)}`);
        }
        if (game instanceof GameRunner) {
            throw new ClientError(`Name already running: ${prettyID(login.gameID)}`);
        } 
        let runner = game.login(login, client);
        this.playing.set(client.id, game.id);
        this.log(`Client ${prettyID(client.id)} logged in as ${login.name} to ${prettyID(game.id)}`);

        if (runner) {
            // Lobby has converted into GameRunner
            this.games.set(runner.id, runner);
            runner.start();
            this.log(`Game ${prettyID(game.id)} starting.`);
        }
    }

    handleMakeTurn = async (makeTurn: MakeTurn, client: Client) => {
        let gameID = this.playing.get(client.id);
        if (gameID === undefined) {
            throw new ClientError("Client not playing a game");
        }
        let game = this.games.get(gameID);
        if (!game) {
            throw new Error(`Internal server error, no such game?: ${prettyID(gameID)}`);
        }
        if (game instanceof Lobby) {
            throw new ClientError("Game hasn't started yet")
        }
        await game.makeTurn(makeTurn, client);

        if (game.game.turn % 250 === 0) {
            this.log(`Game ${prettyID(game.id)} passed turn ${game.game.turn}`);
        }
        if (game.winner) {
            let client;
            for (let [clientid, teamid] of game.players) {
                if (teamid == game.winner.teamID) {
                    client = clientid;
                }
            }

            this.log(`Game ${prettyID(game.id)} finished, winner: ${prettyID(client)} (${game.winner.name})`);
            await this.saveGame(game);
            this.games.delete(game.id);
        }
    }

    handleSpectateAll = async (spectateAll: SpectateAll, client: Client) => {
        this.log(`Client ${prettyID(client.id)} registered as spectator`);
        this.spectators.push(client);
        for (let game of this.games.values()) {
            if (game instanceof GameRunner) {
                await game.addSpectator(client);
            }
        }
    }

    handleCreateGame = async (createGame: CreateGame, client: Client) => {
        let lobby = new Lobby(uuid(), createGame, this.spectators, this.opts.debug, client);
        this.games.set(lobby.id, lobby);
        this.log(`Created ${lobby.isPickup? 'pickup ':''}game ${prettyID(lobby.id)} on map ${lobby.map.name}`);
    }
}