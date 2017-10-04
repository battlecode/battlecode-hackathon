
export type EntityID = number;
export type TeamID = number;

export interface Location {
    x: number;
    y: number;
}

export type EntityType = "thrower" | "statue" | "hedge";

export type MapTile = "G" | "D";

/**
 * The data for an entity in the world.
 */
export interface EntityData {
    id: EntityID;
    type: EntityType;
    location: Location;
    team: TeamID;
    hp: number;
    cooldown_end?: number;
    held_by?: boolean;
    holding?: EntityID;
    holding_end?: number;
}

/**
 * The data for the map.
 */
export interface MapData {
    height: number;
    width: number;
    /**
     * Indexed as [y][x];
     */
    tiles: MapTile[][];
}
/**
 * Team data.
 */
export interface TeamData {
    id: TeamID;
    name: string;
}

/**
 * Request the server login a player.
 */
export interface Login {
    command: "login";
    name: string;
}

/**
 * Confirms that a player has been logged in.
 */
export interface LoginConfirm {
    command: "login_confirm";
    name: string;
    id: TeamID;
}

/**
 * Notifies clients that a game has started.
 */
export interface GameStart {
    command: "start";
    map: MapData;
    teams: TeamData[];
}

/**
 * Notifies clients about the current turn / world state.
 */
export interface NextTurn {
    command: "next_turn";
    changed: EntityData[];
    dead: EntityID[];

    successful?: Action[];
    failed?: Action[];
    reasons?: string[];

    next_team: TeamID;
    winner?: TeamID;
}
/**
 * Tells server to perform a list of action.
 */
export interface MakeTurn {
    command: "make_turn";
    actions: Action[];
}
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
 * Action types
 */
export type Action = MoveAction | PickupAction | ThrowAction | BuildAction | DisintegrateAction;

/**
 * Message types
 */
export type IncomingCommand = Login | MakeTurn;
export type OutgoingCommand = LoginConfirm | GameStart | NextTurn;
