import * as schema from './schema';
import LocationMap from './locationmap';
import clone from 'lodash-es/clone';
import Mutex from './mutex';
import * as utf8 from './util/utf8';

import {inflate} from 'pako/lib/inflate';
import * as base64 from 'base64-js';
import cloneDeep from 'lodash-es/cloneDeep';

export class State {
    gameID: schema.GameID;
    sectors: LocationMap<schema.SectorData>;
    entities: schema.EntityData[];
    teams: schema.TeamData[];
    turn: number;
    width: number;
    height: number;
    tiles: schema.MapTile[][];
    winner?: schema.TeamID;

    constructor(start: schema.GameStart) {
        this.sectors = new LocationMap(start.initialState.width, start.initialState.height);
        this.entities = [];
        for (let entity of start.initialState.entities) {
            this.entities[entity.id] = cloneDeep(entity);
        }
        this.teams = cloneDeep(start.teams);
        this.gameID = start.gameID;
        // first turn received is 0
        this.turn = -1;
        this.winner = undefined;
        this.width = start.initialState.width;
        this.height = start.initialState.height;
        this.tiles = start.initialState.tiles;
    }

    apply(nextTurn: schema.NextTurn) {
        if (nextTurn.turn !== this.turn + 1) {
            throw new Error(`wrong turns: ${nextTurn.turn} should be ${this.turn + 1}`);
        }
        this.turn += 1;
        for (let entity of nextTurn.changed) {
            this.entities[entity.id] = cloneDeep(entity);
        }
        for (let dead of nextTurn.dead) {
            delete this.entities[dead];
        }
        for (let sector of nextTurn.changedSectors) {
            this.sectors.set(sector.topLeft.x, sector.topLeft.y, cloneDeep(sector));
        }
        if (nextTurn.winnerID !== undefined) {
            this.winner = nextTurn.winnerID;
        }
    }
}

export class Timeline {
    deltas: schema.NextTurn[];
    snapshots: State[];
    snapFreq: number;

    current: State;
    farthest: State;

    changeCbs: Array<(farthest: State, nextTurn: schema.NextTurn) => void>;

    constructor(start: schema.GameStart, snapFreq: number = 100) {
        this.snapshots = [];
        this.deltas = [];
        this.changeCbs = [];
        this.snapshots[0] = new State(start);
        this.snapFreq = snapFreq;
        this.current = cloneDeep(this.snapshots[0]);
        this.farthest = cloneDeep(this.snapshots[0]);
    }

    apply(nextTurn: schema.NextTurn) {
        this.farthest.apply(nextTurn);
        this.deltas[nextTurn.turn] = nextTurn;
        if (this.farthest.turn % this.snapFreq == 0) {
            this.snapshots[this.farthest.turn] = cloneDeep(this.farthest);
        }
    }

    /**
     * @param cb will be called with the state after each change of the current selected state,
     *  and the delta that caused that change
     */
    on(event: 'change', cb: (farthest: State, nextTurn: schema.NextTurn) => void) {
        this.changeCbs.push(cb);
    }

    get initial(): State {
        return this.snapshots[0];
    }

    loadLock: Mutex = new Mutex();
    async load(turn: number, callback?: () => void) {
        if (turn > this.deltas.length || turn < 0) throw new Error("out of range: "+turn);

        let lock = await this.loadLock.acquire();
        let previous = turn;
        while (this.snapshots[previous] === undefined) previous--;
        let newCurrent = cloneDeep(this.snapshots[previous]);
        while (newCurrent.turn < turn) {
            // async, don't block the ui thread
            if (newCurrent.turn % 5 === 0) await new Promise(r => setTimeout(r, 0));

            const delta = this.deltas[newCurrent.turn + 1];

            newCurrent.apply(delta);
            for (let cb of this.changeCbs) {
                cb(newCurrent, delta);
            }
        }

        this.current = newCurrent;
        lock.release();
        if (callback) {
            callback();
        }
    }

    async loadNextNTurns(numTurns: number, callback?: () => void) {
        if (numTurns < 0) throw new Error("out of range: "+numTurns);

        let lock = await this.loadLock.acquire();
        let newCurrent = cloneDeep(this.current);
        const targetTurn = newCurrent.turn + numTurns;
        while (newCurrent.turn < targetTurn) {
            // async, don't block the ui thread
            if (newCurrent.turn % 5 === 0) await new Promise(r => setTimeout(r, 0));

            const delta = this.deltas[newCurrent.turn + 1];

            newCurrent.apply(delta);
            for (let cb of this.changeCbs) {
                cb(newCurrent, delta);
            }
        }

        this.current = newCurrent;
        lock.release();
        if (callback) {
            callback();
        }        
    }
}

export type TimelineCallback = (timeline: Timeline) => void;

/**
 * A collection of timelines progressing in parallel.
 */
export class TimelineCollection {
    timelines: {[gameID: string]: Timeline} = Object.create(null);
    unhandled: {[gameID: string]: schema.NextTurn[]} = Object.create(null);

    gameIDs: schema.GameID[] = [];

    apply(command: schema.OutgoingCommand) {
        if (command.command === 'start') {
            this.timelines[command.gameID] = new Timeline(command);
            this.gameIDs.push(command.gameID);
        } else if (command.command === 'nextTurn') {
            let {gameID} = command;

            if (this.timelines[gameID] !== undefined) {
                this.timelines[gameID].apply(command);
            } else {
                if (this.unhandled[gameID] === undefined) {
                    this.unhandled[gameID] = []
                }
                this.unhandled[gameID].push(command);
            }
        } else if (command.command === 'gameReplay') {
            let buf = base64.toByteArray(command.matchData);
            let data: Uint8Array = inflate(buf);
            let json = utf8.decodeUTF8(data);
            let matchData = <schema.MatchData>JSON.parse(json);
            let {gameID} = matchData;

            this.apply({
                command: "start",
                gameID: matchData.gameID,
                initialState: matchData.initialState,
                teams: matchData.teams,
                timeoutMS: 100,
            });
            for (let turn of matchData.turns) {
                this.apply(turn);
            }
            if (this.unhandled[matchData.gameID] !== undefined) {
                for (let turn of this.unhandled[matchData.gameID]) {
                    this.apply(turn);
                }
                delete this.unhandled[matchData.gameID];
            }
        }
    }

    delete(gameID: schema.GameID) {
        delete this.timelines[gameID];
        this.gameIDs.splice(this.gameIDs.indexOf(gameID), 1);
    }
}
