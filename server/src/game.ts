import { Action, EntityData, SectorData, EntityID, NextTurn,
    Location, MapTile, TeamData, TeamID, MapData, NEUTRAL_TEAM } from './schema';
import { Sector } from './zone';

function distance(a: Location, b: Location): number {
    var dx = a.x - b.x;
    var dy = a.y - b.y;
    return dx * dx + dy * dy;
}

function isOutOfBound(a: Location, world: MapData): boolean {
    return a.x >= world.width ||
           a.x < 0 ||
           a.y >= world.height ||
           a.y < 0;
}

const DELAYS = {
    move: 1,
    pickup: 0,
    throw: 10,
    build: 10
};

// a map from locations to entities
// (Map<Location, T> works by identity which is wrong)
export class LocationMap<T> {
    // a sparse array
    // don't worry, the JS engine can handle it :)
    // non-set items will be undefined
    items: T[];

    width: number;
    height: number;

    constructor(width: number, height: number) {
        this.items = Array(width * height);
        this.width = width;
        this.height = height;
    }

    set(x: number, y: number, v: T) {
        if (x > this.width || y > this.height) {
            throw new Error("out of bounds: "+x+","+y+" ["+this.width+","+this.height+"]");
        }
        const i = y * this.width + x;
        this.items[i] = v;
    }

    delete(x: number, y: number) {
        if (x > this.width || y > this.height) {
            throw new Error("out of bounds: "+x+","+y+" ["+this.width+","+this.height+"]");
        }
        const i = y * this.width + x;
        delete this.items[i];
    }

    has(x: number, y: number): boolean {
        if (x > this.width || y > this.height) {
            throw new Error("out of bounds: "+x+","+y+" ["+this.width+","+this.height+"]");
        }
        const i = y * this.width + x;
        return this.items[i] !== undefined;
    }

    get(x: number, y: number): T | undefined {
        if (x > this.width || y > this.height) {
            throw new Error("out of bounds: "+x+","+y+" ["+this.width+","+this.height+"]");
        }
        const i = y * this.width + x;
        return this.items[i];
    }

    *values(): IterableIterator<T> {
        for (let i = 0; i < this.width; i++) {
            for (let j = 0; j < this.height; j++) {
                let v = this.get(i,j);
                if (v) {
                    yield v;
                }
            }
        }
    }
}


export class Game {
    world: MapData;
    teams: TeamData[];
    entities: Map<EntityID, EntityData>;
    occupied: LocationMap<EntityID>;
    sectors: LocationMap<Sector>;
    turn: number;
    highestId: number;
    // ids must be consecutive
    nextTeam: TeamID;

    constructor(world: MapData, teams: TeamData[]) {
        validateTeams(teams);
        this.turn = 0;
        this.highestId = 0;
        this.world = world;
        this.teams = teams;
        this.nextTeam = teams[1].id;
        this.entities = new Map();
        this.occupied = new LocationMap(world.width, world.height);
        this.sectors = new LocationMap(world.width, world.height);

        for (var x = 0; x < this.world.width; x += this.world.sector_size) {
            for(var y = 0; y < this.world.height; y += this.world.sector_size) {
                this.sectors.set(x, y, new Sector({y: y, x: x}));
            }
        }
    }

    private makeNextTurn(): NextTurn {
        return {
            command: "next_turn",
            changed: [],
            dead: [],
            changed_sectors: [],
            successful: [],
            failed: [],
            reasons: [],
            next_team: this.nextTeam
        };
    }

    addInitialEntitiesAndSectors(entities: EntityData[]): NextTurn {
        if (this.turn !== 0) {
            throw new Error("Can't add entities except on turn 0");
        }

        var diff = this.makeNextTurn();
        for (var ent of entities) {
            this.addOrUpdateEntity(ent); 
            diff.changed.push(ent);
        }

        diff.changed_sectors = [];
        for (var sector of this.sectors.values()) {
            diff.changed_sectors.push(sector);
        }

        diff.next_team = this.nextTeam;

        return diff;
    }

    /**
     * returns Sector based on location
     */  
    getSector(location: Location): Sector {
        var x = location.x - location.x % this.world.sector_size;
        var y = location.y - location.y % this.world.sector_size;
        var sector = this.sectors.get(x,y);
        if (!sector) {
            throw new Error("sector does not exist: "+JSON.stringify(location));
        }
        return sector;
    }

    addOrUpdateEntity(entity: EntityData) {
        let current = this.occupied.get(entity.location.x, entity.location.y);
        if (current !== undefined && current !== entity.id) {
            throw new Error("location occupied: "+JSON.stringify(entity)+current);
        }

        if (this.entities.has(entity.id)) {
            var old = this.entities.get(entity.id) as EntityData;
            this.occupied.delete(old.location.x, old.location.y);
        }
        
        if (entity.type == "statue") {
            var sector = this.getSector(entity.location);
            sector.addStatue(entity);
        }

        this.entities.set(entity.id, entity);
        this.occupied.set(entity.location.x, entity.location.y, entity.id);

        this.highestId = Math.max(entity.id, this.highestId);
    }

    deleteEntity(id: EntityID) {
        if (!this.entities.has(id)) {
            throw new Error("can't delete nonexistent entity: "+id);
        }

        var entity = this.entities.get(id) as EntityData;
        
        // Statues do not move 
        if (entity.type == "statue") {
            var sector = this.getSector(entity.location); 
            sector.deleteStatue(entity);
        }

        this.entities.delete(id);
        this.occupied.delete(entity.location.x, entity.location.y);
    }

    makeTurn(team: TeamID, actions: Action[]): NextTurn {
        if (team !== this.nextTeam) {
            throw new Error("wrong team for turn: " + team + ", should be: "+this.nextTeam);
        }
        // we never want to give the neutral team a turn
        if (this.nextTeam == this.teams.length - 1) {
            this.nextTeam = 1;
        } else {
            this.nextTeam++;
        }
        this.turn++;

        var diff = this.makeNextTurn();
        for (var i = 0; i < actions.length; i++) {
            this.doAction(team, diff, actions[i]);
        }

        // spawn throwers from controlled sectors every 10 turns
        if (this.turn % 10 == 0) {
            for (var thrower of this.getNewThrowers()) {
                this.addOrUpdateEntity(thrower);
                diff.changed.push(thrower);
            }
        }

        diff.changed_sectors = this.getChangedSectors();
        diff.next_team = this.nextTeam;
        return diff;
    }

    getChangedSectors(): SectorData[] {
        var changedSectors: SectorData[] = []; 
        for (var sector of this.sectors.values()) {
            if (sector.checkChanged()) {
                changedSectors.push(Sector.getSectorData(sector))
            }
        }
        return changedSectors
    }

    /**
     * Returns EntityData[] of throwers to be spawned in controlled sectors
     */
    getNewThrowers(): EntityData[] {
        var throwers: EntityData[] = []
        for (var sector of this.sectors.values()) {
            var statue = this.entities.get(sector.getSpawningStatueID())
            // if statue exists in game  
            if (statue) {
                // TODO full spawn logic
                let next = { x: statue.location.x + 1, y: statue.location.y };
                if (!isOutOfBound(next, this.world) && !this.occupied.has(next.x, next.y)) {
                    var newThrower: EntityData = {
                        id: this.highestId + 1,
                        type: "thrower",
                        location: next,
                        team: statue.team,
                        hp: 10
                    };
                    throwers.push(newThrower);
                }
            }
        }
        return throwers; 
    }

    doAction(team: TeamID, diff: NextTurn, action: Action) {
        var entity = this.entities.get(action.id);

        if (!entity) {
            diff.failed.push(action);
            diff.reasons.push("no such entity: "+action.id);
            return;
        }

        if (entity.team !== team) {
            diff.failed.push(action);
            diff.reasons.push("wrong team: "+entity.team);
        }

        if (action.action == "disintegrate") {
            this.deleteEntity(action.id);

            diff.dead.push(entity.id);
            diff.successful.push(action);
            return;
        }

        if (entity.cooldown_end !== undefined && entity.cooldown_end > this.turn) {
            diff.failed.push(action);
            diff.reasons.push("Entity still on cool down: " + entity.id);
            return;
        }

        if (action.action === "move" || action.action === "build") {
            if (distance(entity.location, action.loc) > 2) {
                diff.failed.push(action);
                diff.reasons.push("Distance too far: old: " + JSON.stringify(entity.location)
                     + " new: " + action.loc);
                return;
            }

            if (this.occupied.has(action.loc.x, action.loc.y)) {
                diff.failed.push(action);
                diff.reasons.push("Location already occupied: " + JSON.stringify(action.loc));
                return;
            }

            if (entity.type === "statue") {
                diff.failed.push(action);
                diff.reasons.push("Statues can't move or build. (They build automatically.)");
                return;

            }

            if (isOutOfBound(action.loc, this.world)) {
                diff.failed.push(action);
                diff.reasons.push("Location out of bounds of world: " + JSON.stringify(action.loc));
                return;
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
            diff.successful.push(action);
            diff.changed.push(newEntity);
        }
    }
}

const validateTeams = (teams: TeamData[]) => {
    if (teams[0] !== NEUTRAL_TEAM) {
        throw new Error("neutral team is not first!");
    }
    for (let i = 1; i < teams.length; i++) {
        if (teams[i].id != i) {
            throw new Error("invalid team data list");
        }
    }
};
