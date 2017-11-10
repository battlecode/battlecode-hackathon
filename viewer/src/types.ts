
/* Enum for the status of a game, used by viewer GUI. */
export type GameStatus = 'waiting' | 'running' | 'finished';

/* Represents a currently loaded game in the GUI. */
export interface ActiveGameInfo {
    status: GameStatus;
    mapName: string;
    playerOne?: string;
    playerTwo?: string;
    closeActiveGame: () => void;
};
