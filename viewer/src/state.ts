import * as schema from './schema';
import LocationMap from './locationmap';
import clone from 'lodash-es/clone';
import Mutex from './mutex';

export class State {
    id: schema.GameID;
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
            this.entities[entity.id] = clone(entity);
        }
        this.teams = clone(start.teams);
        this.id = start.gameID;
        this.turn = 0;
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
            this.entities[entity.id] = clone(entity);
        }
        for (let dead of nextTurn.dead) {
            delete this.entities[dead];
        }
        for (let sector of nextTurn.changedSectors) {
            this.sectors.set(sector.topLeft.x, sector.topLeft.y, clone(sector));
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
        this.snapshots[0] = new State(start);
        this.snapFreq = snapFreq;
        this.current = clone(this.snapshots[0]);
        this.farthest = clone(this.snapshots[0]);
    }

    apply(nextTurn: schema.NextTurn) {
        this.farthest.apply(nextTurn);
        this.deltas[nextTurn.turn] = nextTurn;
    }

    on(event: 'change', cb: (farthest: State, nextTurn: schema.NextTurn) => void) {
        this.changeCbs.push(cb);
    }

    loadLock: Mutex = new Mutex();
    async load(turn: number) {
        if (turn > this.deltas.length) throw new Error("out of range: "+turn);

        let lock = await this.loadLock.acquire();
        let previous = turn;
        while (this.snapshots[previous] === undefined) previous--;
        while (this.current.turn < turn) {
            // async, don't block the ui thread
            if (this.current.turn % 5 === 0) await new Promise(r => setTimeout(r, 0));

            const delta = this.deltas[this.current.turn + 1];

            this.current.apply(delta);
            for (let cb of this.changeCbs) {
                cb(this.current, delta);
            }
        }

        lock.release();
    }

}