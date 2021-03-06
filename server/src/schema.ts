/**
 * The ID of an entity that exists
 */
export type EntityID = number;

/**
 * The ID of a team.
 * TeamID 0 is always the ID of the non-player team (i.e. the team of hedges).
 */
export type TeamID = number;

/**
 * The ID of a gameID. A UUID v4.
 */
export type GameID = string;

/**
 * The key to a key-protected gameID.
 */
export type PlayerKey = string;

/**
 * A location in the world.
 */
export interface Location {
    x: number;
    y: number;
}

/**
 * The type of an entity.
 */
export type EntityType = "thrower" | "statue" | "hedge";

/**
 * A map tile.
 */
export type MapTile = "G" | "D";

/**
 * The data for an entity in the world.
 */
export interface EntityData {
    id: EntityID;
    type: EntityType;
    location: Location;
    hp: number;
    teamID: TeamID;
    cooldownEnd?: number;
    heldBy?: EntityID;
    holding?: EntityID;
    holdingEnd?: number;
}

/**
 * The data for a Sector
 */
export interface SectorData {
    topLeft: Location;
    controllingTeamID: TeamID;
}

/**
 * The data for the map.
 * 
 * Note: map.json files consist of a MapData object serialized to JSON.
 */
export interface MapFile {
    /**
     * Required sanity check.
     */
    version: "battlecode 2017 hackathon map",

    /**
     * Number of teams required to play the map (not incl. neutral)
     */
    teamCount: number;

    /**
     * The height of the map in tiles.
     */
    height: number;

    /**
     * The width of the map in tiles.
     */
    width: number;

    /**
     * Map is partitioned into square Sectors
     * Each Sector stores Location of its top left corner and covers sectorSize * sectorSize area 
     */
    sectorSize: number;

    /**
     * Slightly wacky indexing:
     * Indexed as [height - (y + 1)][x];
     * This allows a list of tiles to be written out in a text file
     * such that their lower left corner will be placed at (0,0),
     * up is y, and right is x.
     */
    tiles: MapTile[][];

    /**
     * The initial entities on the map.
     */
    entities: EntityData[];

    /**
     * The name of the map.
     * Note: you don't actually need to write this in a map file, it'll just get overwritten when loaded.
     */
    mapName?: string;

}

export interface GameState extends MapFile {
    /** 
     * Sectors are not stored in a map file but are stored in the game state
     * sent to the client.
     */
    sectors: SectorData[];
}

/**
 * Team data.
 */
export interface TeamData {
    teamID: TeamID;

    /**
     * The name of the team.
     */
    name: string;

    /**
     * The key the player used to login to the gameID.
     * unset if the player used no key.
     */
    key?: PlayerKey;
}

/**
 * The neutral team.
 */
export const NEUTRAL_TEAM: TeamData = {
    teamID: 0,
    name: 'neutral',
}

// All possible actions.

export interface MoveAction {
    action: "move";
    id: EntityID;
    dx: number;
    dy: number;
}
export interface PickupAction {
    action: "pickup";
    id: EntityID;
    pickupID: EntityID;
}
export interface ThrowAction {
    action: "throw";
    id: EntityID;
    dx: number;
    dy: number;
}
export interface BuildAction {
    action: "build";
    id: EntityID;
    dx: number;
    dy: number;
}
export interface DisintegrateAction {
    action: "disintegrate";
    id: EntityID;
}

///////////////////////
// Client -> server. //
///////////////////////

/**
 * Request to take part in a gameID.
 */
export interface Login {
    command: "login";

    /**
     * The name of the bot's team.
     * Note, we override this field if the bot is playing on the game server.
     */
    name: string;
    
    /**
     * The gameID the player desires to connect to.
     * If this field is null, the server will make a new gameID and connect the client to it.
     * If the environment variable BATTLECODE_GAME exists, clients should
     * set this field to its value.
     */
    gameID?: GameID;

    /**
     * The key to the gameID, if the gameID is key-protected.
     */
    key?: PlayerKey;
}

/**
 * Tells server to perform a list of action.
 */
export interface MakeTurn {
    command: "makeTurn";
    gameID: GameID;

    /**
     * Send the turn from the previous NextTurn received + 1.
     */
    turn: number;
    actions: Action[];
}

//////////////////////
// Server -> client //
//////////////////////

/**
 * Confirms that a player has been logged in.
 */
export interface LoginConfirm {
    command: "loginConfirm";
    gameID: GameID;
    teamID: TeamID;
}

/**
 * Notifies clients that a gameID has started.
 */
export interface GameStart {
    command: "start";
    gameID: GameID;
    initialState: GameState;
    teams: TeamData[];

    /**
     * Timeout for each turn.
     */
    timeoutMS: number;
}

/**
 * Notifies clients about the current turn / world state.
 */
export interface NextTurn {
    command: "nextTurn";
    gameID: GameID;
    turn: number;

    changed: EntityData[];
    dead: EntityID[];
    changedSectors: SectorData[];

    /**
     * The ID of the previous team that went.
     */
    lastTeamID: TeamID;
    successful: Action[];
    failed: Action[];
    reasons: string[];

    nextTeamID: TeamID;
    winnerID?: TeamID;
}

/**
 * Tells a team that it missed a turn.
 * Only sent to the team that missed; will be immediately followed by a NextTurn.
 */
export interface MissedTurn {
    command: "missedTurn";
    gameID: GameID;
    turn: number;
}

/**
 * Notifies client that its message was not understood.
 */
export interface ErrorCommand {
    command: "error";
    reason: string;
}

/**
 * Sends the entire state of the world, for testing purposes.
 */
export interface Keyframe {
    command: "keyframe";
    state: GameState;
    teams: TeamData[];
}

/**
 * Used by the viewer;
 */
export interface GameStatusUpdate {
    command: "gameStatusUpdate";
    gameID: GameID;
    // team names
    connected: string[];
    status: "lobby" | "running" | "finished" | "cancelled";
    map: string;
}

///////////////////
// Extra control //
///////////////////


// Note: client implementations in new languages need not implement the following commands.

/**
 * Create a gameID but do not participate.
 * At the end of the gameID, a GameData will be sent, containing all the information for the gameID.
 */
export interface CreateGame {
    command: "createGame";

    /**
     * The key to the server, if the server is password-protected.
     */
    serverKey?: string;

    /**
     * The teams that will be participating in the gameID.
     * Note: player .botName will override the .botName set here.
     * If keys are set, players will be assigned to teams based on keys.
     * Otherwise, players will be assigned in order of connection.
     */
    teams?: TeamData[];

    /**
     * The map the gameID will be played on.
     * Use a string to load a built-in map file with that name (case sensitive.)
     */
    map: MapFile | string;

    /**
     * States that the client is interested in receiving a replay when the game is complete.
     */
    sendReplay?: boolean;

    /**
     * Timeout for each turn, in milliseconds.
     * If you don't want a timeout, just set it really high.
     */
    timeoutMS?: number;
}

export interface CreateGameConfirm {
    command: "createGameConfirm";

    gameID: GameID;
}

export interface ListMapsRequest {
    command: "listMapsRequest";
}

export interface ListMapsResponse {
    command: "listMapsResponse";

    mapNames: string[];
    /**
     * Each entry in Maps is a MapFile encoded as JSON.
     * Woo, recursive encoding!
     */
    maps: string[];
}

export interface ListReplaysRequest {
    command: "listReplaysRequest";
}

export interface ListReplaysResponse {
    command: "listReplaysResponse";

    replayNames: string[];
}

export interface ReplayRequest {
    command: "replayRequest",
    name: string;
}

export interface ReplayResponse {
    command: "replayResponse",
    name: string;

    /**
     * A JSON-encoded MatchData.
     */
    match: string;
}

/**
 * Data sent to catch a client up to the current state of the gameID.
 * Optionally sent at the end of the gameID to whoever created it.
 */
export interface GameReplay {
    command: "gameReplay";

    // Note: this data is also included in the match data; these fields are provided
    // to make life simpler for the consumer
    id: GameID;

    winner?: TeamData;

    /**
     * The completed match.
     * A base64-encoded gzipped JSON-encoded MatchData.
     */
    matchData: string;
}

export interface PlayerConnected {
    command: "playerConnected",
    id: GameID;
    team: TeamID;
}

/**
 * Requests the server send all messages for all gameIDs.
 * Used by the viewer.
 */
export interface SpectateAll {
    command: "spectateAll";
}

/**
 * The data for a finished match.
 * Note that .bch17 files consist of a gzipped MatchData JSON object.
 */
export interface MatchData {
    /**
     * Required sanity check.
     */
    version: "battlecode 2017 hackathon match",

    gameID: GameID;
    initialState: GameState;
    winner?: TeamID;
    teams: TeamData[];
    turns: NextTurn[];
}

/**
 * Action types
 */
export type Action = MoveAction | PickupAction | ThrowAction | BuildAction | DisintegrateAction;

/**
 * Message types
 */
export type IncomingCommand = Login | MakeTurn | SpectateAll | CreateGame | ListMapsRequest |
    ListReplaysRequest | ReplayRequest;
export type OutgoingCommand = LoginConfirm | GameStart | NextTurn | MissedTurn | ErrorCommand | Keyframe |
    ListMapsResponse | ListReplaysResponse | GameReplay | ReplayResponse | PlayerConnected | CreateGameConfirm | GameStatusUpdate;
