
/* Enum for the status of a game, used by viewer GUI. */
export type GameStatus = 'lobby' | 'running' | 'finished' | 'cancelled';

/* Represents a currently loaded game in the GUI. */
export interface ActiveGameInfo {
    gameID: string;
    status: GameStatus;
    mapName: string;
    playerOne?: string;
    playerTwo?: string;
    closeActiveGame: () => void;
    viewActiveGame: () => void;
};
