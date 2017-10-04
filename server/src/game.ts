import { Action, EntityData, EntityID, Location, MapTile, TeamData, TeamID, MapData } from './schema';

var loc: Location = {
    x: 1,
    y: 2
};

export class TurnDiff {
    dirty: EntityData[];
    dead: EntityID[];
    successfulActions: Action[];
    failedActions: Action[];
    reasons: string[];

    constructor() {
        this.dirty = [];
        this.dead = [];
        this.successfulActions = [];
        this.failedActions = [];
        this.reasons = [];
    }

}

function distance(a: Location, b: Location): number {
    var dx = a.x - b.x;
    var dy = a.y - b.y;
    return dx * dx + dy * dy;
}

function isOutOfBound(a: Location, world: MapData): boolean {
    if(a.x >= world.width || a.x < 0) {
        return true;
    } 
    
    if (a.y >= world.height || a.y < 0) {
        return true;
    }
    
    return false;

}

const DELAYS = {
    move: 1,
    pickup: 0,
    throw: 10,
    build: 10
};

export class Game {
    world: MapData;
    teams: TeamData[];
    entities: Map<EntityID, EntityData>;
    occupied: Map<Location, EntityID>;
    turn: number;
    highestId: number;
    // ids must be consecutive
    nextTeam: TeamID;

    constructor(world: MapData, teams: TeamData[]) {
        this.turn = 0;
        this.highestId = 0;
        this.world = world;
        this.teams = teams;
        this.nextTeam = teams[0].id;
        this.entities = new Map();
        this.occupied = new Map();
    }

    addInitialEntities(entities: EntityData[]): TurnDiff {
        if (this.turn !== 0) {
            throw new Error("Can't add entities except on turn 0");
        }

        var diff = new TurnDiff();
        for (var ent of entities) {
            this.addOrUpdateEntity(ent);
            diff.dirty.push(ent);
        }
        return diff;
    }

    addOrUpdateEntity(entity: EntityData) {
        if (this.occupied.has(entity.location)) {
            throw new Error("location occupied: "+entity.location);
        }

        if (this.entities.has(entity.id)) {
            var old = this.entities.get(entity.id) as EntityData;
            this.occupied.delete(old.location);
        }

        this.entities.set(entity.id, entity);
        this.occupied.set(entity.location, entity.id);

        this.highestId = Math.max(entity.id, this.highestId);
    }

    deleteEntity(id: EntityID) {
        if (!this.entities.has(id)) {
            throw new Error("can't delete nonexistent entity: "+id);
        }

        var entity = this.entities.get(id) as EntityData;
        this.entities.delete(id);
        this.occupied.delete(entity.location);
    }

    makeTurn(team: TeamID, actions: Action[]): TurnDiff {
        if (team !== this.nextTeam) {
            throw new Error("wrong team for turn: " + team + ", should be: "+this.nextTeam);
        }
        this.nextTeam = (this.nextTeam + 1) % this.teams.length;
        this.turn++;

        var diff = new TurnDiff();
        for (var i = 0; i < actions.length; i++) {
            this.doAction(team, diff, actions[i]);
        }
        return diff;
    }

    doAction(team: TeamID, diff: TurnDiff, action: Action) {
        var entity = this.entities.get(action.id);

        if (!entity) {
            diff.failedActions.push(action);
            diff.reasons.push("no such entity: "+action.id);
            return;
        }

        if (entity.team !== team) {
            diff.failedActions.push(action);
            diff.reasons.push("wrong team: "+entity.team);
        }

        if (action.action == "disintegrate") {
            this.deleteEntity(action.id);

            diff.dead.push(entity.id);
            diff.successfulActions.push(action);
            return;
        }

        if (entity.cooldown_end !== undefined && entity.cooldown_end > this.turn) {
            diff.failedActions.push(action);
            diff.reasons.push("Entity still on cool down: " + entity.id);
            return;
        }

        if (action.action === "move" || action.action === "build") {
            if (distance(entity.location, action.loc) > 2) {
                diff.failedActions.push(action);
                diff.reasons.push("Distance too far: old: " + entity.location + " new: " + action.loc);
                return;
            }

            if (this.occupied.has(action.loc)) {
                diff.failedActions.push(action);
                diff.reasons.push("Location already occupied: " + action.loc);
                return;
            }

            if (isOutOfBound(action.loc, this.world)) {
                diff.failedActions.push(action);
                diff.reasons.push("Location out of bounds of world: " + action.loc);
            }

            var newEntity: EntityData;
            if (action.action == "move") {
                newEntity = {... entity};
                newEntity.location = action.loc;
            } else {
                newEntity = {
                    id: this.highestId + 1,
                    type: "statue",
                    location: action.loc,
                    team: team,
                    hp: 1
                };
            }
            this.addOrUpdateEntity(newEntity);
            diff.successfulActions.push(action);
            diff.dirty.push(newEntity);
        }

    }

}