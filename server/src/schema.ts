export type EntityID = number;

/**
 * The ID of a team.
 * TeamID 0 is always the ID of the non-player team (i.e. the team of hedges).
 */
export type TeamID = number;

/**
 * The ID of a game.
 */
export type GameID = string;

/**
 * The key to a key-protected game.
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
    team: TeamID;
    cooldown_end?: number;
    held_by?: boolean;
    holding?: EntityID;
    holding_end?: number;
}

/**
 * The data for a Sector
 */
export interface SectorData {
    top_left: Location;
    controlling_team: TeamID;
}

/**
 * The data for the map.
 * 
 * Note: .bcmap files are simply gzipped MapData JSON objects.
 */
export interface MapData {
    /**
     * The name of the map.
     */
    name: string;

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
     * Each Sector stores Location of its top left corner and covers sector_size * sector_size area 
     */
    sector_size: number;

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
     * The initial sectors of the map.
     */
    sectors: SectorData[];
}

/**
 * Team data.
 */
export interface TeamData {
    id: TeamID;

    /**
     * The name of the team.
     */
    teamName: string;

    /**
     * The name of the bot.
     */
    botName: string;

    /**
     * The key the player used to login to the game.
     * unset if the player used no key.
     */
    key?: PlayerKey;
}

/**
 * The neutral team.
 */
export const NEUTRAL_TEAM: TeamData = {
    id: 0,
    teamName: 'neutral',
    botName: 'neutral'
}

// All possible actions.

export interface MoveAction {
    action: "move";
    id: EntityID;
    loc: Location;
}
export interface PickupAction {
    action: "pickup";
    id: EntityID;
    pickupid: EntityID;
}
export interface ThrowAction {
    action: "throw";
    id: EntityID;
    loc: Location;
}
export interface BuildAction {
    action: "build";
    id: EntityID;
    loc: Location;
}
export interface DisintegrateAction {
    action: "disintegrate";
    id: EntityID;
}

/**
 * The data for a completed match.
 * Note: .bh17 files are gzipped MatchData JSON objects.
 */
export interface MatchData {
    map: MapData;
    winner: TeamData;
    turns: NextTurn[];
}

///////////////////////
// Client -> server. //
///////////////////////

/**
 * Request to take part in a game.
 */
export interface Login {
    command: "login";

    /**
     * The name of the bot's team.
     * Note, the bot is allowed to lie; we'll fix it for it.
     */
    teamName: string;

    /**
     * The name the player desires to be called.
     */
    botName: string;
    
    /**
     * The game the player desires to connect to.
     * If this field is null, the server will make a new game and connect the client to it.
     * If the environment variable BATTLECODE_GAME exists, clients should
     * set this field to its value.
     */
    game?: GameID;

    /**
     * The key to the game, if the game is key-protected.
     */
    key?: PlayerKey;
}

/**
 * Requests the server send all messages for all games.
 * Used by the viewer.
 */
export interface SpectateAll {
    command: "spectate_all";
    game: GameID;
}

/**
 * Tells server to perform a list of action.
 */
export interface MakeTurn {
    command: "make_turn";
    game: GameID;

    /**
     * Send the turn from the previous NextTurn received.
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
    command: "login_confirm";
    game: GameID;
    name: string;
    id: TeamID;
}

/**
 * Notifies clients that a game has started.
 */
export interface GameStart {
    command: "start";
    game: GameID;
    map: MapData;
    teams: TeamData[];
}

/**
 * Notifies clients about the current turn / world state.
 */
export interface NextTurn {
    command: "next_turn";
    game: GameID;
    turn: number;

    changed: EntityData[];
    dead: EntityID[];
    changed_sectors: SectorData[];

    successful: Action[];
    failed: Action[];
    reasons: string[];

    next_team: TeamID;
    winner?: TeamID;
}

/**
 * Notifies client that its message was not understood.
 */
export interface ClientError {
    command: "error";
    reason: string;
}

/**
 * Sends the entire state of the world, for testing purposes.
 */
export interface Keyframe {
    command: "keyframe";
    map: MapData;
    teams: TeamData[];
}

///////////////////
// Extra control //
///////////////////

/**
 * Create a game but do not participate.
 * At the end of the game, a GameData will be sent, containing all the information for the game.
 */
export interface CreateGame {
    command: "create_game";

    /**
     * The key to the server.
     */
    serverKey: string;

    /**
     * The teams that will be participating in the game.
     * Note: player .botName will override the .botName set here.
     * If keys are set, players will be assigned to teams based on keys.
     */
    teams: TeamData[];

    /**
     * The map the game will be played on.
     * Use a string to load a built-in map file.
     */
    map: MapData[] | string;
}

export interface CreateGameConfirm {
    command: "create_game_confirm";

    game: GameID;
}

/**
 * Data sent 
 */
export interface GameData {
    command: "game_data";

    /**
     * The winner of the match.
     */
    winner: TeamData;

    /**
     * The completed match.
     * A base64-encoded gzipped MatchData.
     */
    game_file: string;
}

/**
 * Action types
 */
export type Action = MoveAction | PickupAction | ThrowAction | BuildAction | DisintegrateAction;

/**
 * Message types
 */
export type IncomingCommand = Login | MakeTurn | SpectateAll | CreateGame;
export type OutgoingCommand = LoginConfirm | GameStart | NextTurn | ClientError | Keyframe;
