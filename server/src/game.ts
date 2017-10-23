import { Action, EntityData, SectorData, EntityID, NextTurn, MakeTurn,
    Location, MapTile, TeamData, TeamID, MapData, GameID, NEUTRAL_TEAM } from './schema';
import { Sector } from './zone';
import LocationMap from './locationmap';
import ClientError from './error';

function distance(a: Location, b: Location): number {
    var dx = a.x - b.x;
    var dy = a.y - b.y;
    return dx * dx + dy * dy;
}

function isOutOfBound(a: Location, map: MapData): boolean {
    return a.x >= map.width ||
           a.x < 0 ||
           a.y >= map.height ||
           a.y < 0;
}

const DELAYS = {
    move: 1,
    pickup: 0,
    throw: 10,
    build: 10
};

export class Game {
    id: GameID;
    map: MapData;
    teams: TeamData[];
    entities: Map<EntityID, EntityData>;
    occupied: LocationMap<EntityID>;
    sectors: LocationMap<Sector>;
    highestId: number;
    // ids must be consecutive
    nextTeam: TeamID;
    nextTurn: number;

    constructor(id: GameID, map: MapData, teams: TeamData[]) {
        validateTeams(teams);
        this.id = id;
        this.nextTurn = 0;
        this.highestId = 0;
        this.map = map;
        this.teams = teams;
        this.nextTeam = teams[1].teamID;
        this.entities = new Map();
        this.occupied = new LocationMap(map.width, map.height);
        this.sectors = new LocationMap(map.width, map.height);

        for (var x = 0; x < this.map.width; x += this.map.sectorSize) {
            for(var y = 0; y < this.map.height; y += this.map.sectorSize) {
                this.sectors.set(x, y, new Sector({y: y, x: x}));
            }
        }
    }

    private makeNextTurn(): NextTurn {
        let turn = this.nextTurn;
        this.nextTurn++;
        return {
            command: "nextTurn",
            gameID: this.id,
            turn: turn,
            changed: [],
            dead: [],
            changedSectors: [],
            successful: [],
            failed: [],
            reasons: [],
            nextTeam: this.nextTeam
        };
    }

    addInitialEntitiesAndSectors(entities: EntityData[]): NextTurn {
        if (this.nextTurn !== 0) {
            throw new ClientError("Can't add entities except on turn 0");
        }

        var diff = this.makeNextTurn();
        for (var ent of entities) {
            this.addOrUpdateEntity(ent); 
            diff.changed.push(ent);
        }

        diff.changedSectors = [];
        for (var sector of this.sectors.values()) {
            diff.changedSectors.push(sector);
        }

        diff.nextTeam = this.nextTeam;

        return diff;
    }

    /**
     * returns Sector based on location
     */  
    getSector(location: Location): Sector {
        var x = location.x - location.x % this.map.sectorSize;
        var y = location.y - location.y % this.map.sectorSize;
        var sector = this.sectors.get(x,y);
        if (!sector) {
            throw new ClientError("sector does not exist: "+JSON.stringify(location));
        }
        return sector;
    }

    addOrUpdateEntity(entity: EntityData) {
        let current = this.occupied.get(entity.location.x, entity.location.y);
        if (current !== undefined && current !== entity.id) {
            throw new ClientError("location occupied: "+JSON.stringify(entity)+current);
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
            throw new ClientError("can't delete nonexistent entity: "+id);
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

    makeTurn(team: TeamID, turn: number, actions: Action[]): NextTurn {
        // player will send the last turn id they received
        const correctTurn = this.nextTurn - 1;
        if (turn !== correctTurn) {
            throw new ClientError("wrong turn: given: "+turn+", should be: "+correctTurn);
        }
        if (team !== this.nextTeam) {
            throw new ClientError("wrong team for turn: " + team + ", should be: "+this.nextTeam);
        }
        // we never want to give the neutral team a turn
        if (this.nextTeam == this.teams.length - 1) {
            this.nextTeam = 1;
        } else {
            this.nextTeam++;
        }

        var diff = this.makeNextTurn();
        for (var i = 0; i < actions.length; i++) {
            this.doAction(team, diff, actions[i]);
        }

        // spawn throwers from controlled sectors every 10 turns
        if (this.nextTurn % 10 == 0) {
            for (var thrower of this.getNewThrowers()) {
                this.addOrUpdateEntity(thrower);
                diff.changed.push(thrower);
            }
        }

        diff.changedSectors = this.getChangedSectors();
        diff.nextTeam = this.nextTeam;
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
                if (!isOutOfBound(next, this.map) && !this.occupied.has(next.x, next.y)) {
                    var newThrower: EntityData = {
                        id: this.highestId + 1,
                        type: "thrower",
                        location: next,
                        teamID: statue.teamID,
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

        if (entity.teamID !== team) {
            diff.failed.push(action);
            diff.reasons.push("wrong team: "+entity.teamID);
        }

        if (action.action == "disintegrate") {
            this.deleteEntity(action.id);

            diff.dead.push(entity.id);
            diff.successful.push(action);
            return;
        }

        if (entity.cooldownEnd !== undefined && entity.cooldownEnd > this.nextTurn) {
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

            if (isOutOfBound(action.loc, this.map)) {
                diff.failed.push(action);
                diff.reasons.push("Location out of bounds of map: " + JSON.stringify(action.loc));
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

            var newEntity: EntityData;
            if (action.action == "move") {
                newEntity = {... entity};
                newEntity.location = action.loc;
            } else {
                newEntity = {
                    id: this.highestId + 1,
                    type: "statue",
                    location: action.loc,
                    teamID: team,
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
        if (teams[i].teamID != i) {
            throw new Error("invalid team data list");
        }
    }
};
