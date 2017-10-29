import { Action, EntityData, SectorData, EntityID, NextTurn, MakeTurn,
    Location, MapTile, TeamData, TeamID, MapFile, GameID, NEUTRAL_TEAM, GameState } from './schema';
import { Sector } from './zone';
import LocationMap from './locationmap';
import ClientError from './error';
import deepcopy from 'deepcopy';
import * as _ from 'lodash';

function distance(a: Location, b: Location): number {
    var dx = a.x - b.x;
    var dy = a.y - b.y;
    return dx * dx + dy * dy;
}

function isOutOfBound(a: Location, map: MapFile): boolean {
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
    initialState: GameState;
    map: MapFile;
    teams: TeamData[];
    entities: Map<EntityID, EntityData>;
    occupied: LocationMap<EntityID>;
    sectors: LocationMap<Sector>;
    highestId: number;
    // ids must be consecutive
    nextTeam: TeamID;
    nextTurn: number;

    constructor(id: GameID, map: MapFile, teams: TeamData[]) {
        validateTeams(teams);
        this.id = id;
        this.nextTurn = 0;
        this.highestId = 0;
        this.map = map;
        this.teams = teams;
        this.nextTeam = 1;
        this.entities = new Map();
        this.occupied = new LocationMap(map.width, map.height);

        // compute sectors
        this.sectors = new LocationMap(map.width, map.height);

        for (var x = 0; x < this.map.width; x += this.map.sectorSize) {
            for(var y = 0; y < this.map.height; y += this.map.sectorSize) {
                this.sectors.set(x, y, new Sector({y: y, x: x}));
            }
        }

        for (var e of map.entities) {
            this.addOrUpdateEntity(e);
        }

        let state: any = _.clone(this.map);
        state.sectors = Array.from(this.sectors.values()).map(Sector.getSectorData);
        this.initialState = state;
    }

    firstTurn(): NextTurn {
        return this.makeNextTurn();
    }

    private makeNextTurn(): NextTurn {
        let turn = this.nextTurn;
        let team = this.nextTeam;

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
            nextTeamID: team
        };
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
            let currentEntity = this.entities.get(current);
            if (currentEntity === undefined) {
                throw new Error("can't find entity: "+current);
            }

            if (currentEntity.heldBy != entity.id && currentEntity.holding != entity.id) {
                throw new Error("location occupied: "+JSON.stringify(entity)+current);
            }
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
        if (entity.heldBy === undefined) {
            this.occupied.delete(entity.location.x, entity.location.y);
        }
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
        if (turn % 10 == 0) {
            for (var thrower of this.getNewThrowers()) {
                this.addOrUpdateEntity(thrower);
                diff.changed.push(thrower);
            }
        }

        this.dealFatigueDamage(diff);
        diff.changedSectors = this.getChangedSectors();
        diff.nextTeamID = this.nextTeam;

        if (turn > 1000) {
            // TODO this is wrong
            diff.winnerID = 1;
        }
        return diff;
    }

    dealFatigueDamage(diff: NextTurn) {
        for (var entity of this.entities.values()) {
            if (entity.holdingEnd && entity.holdingEnd < this.nextTurn) {
                this.dealDamage(entity.id, 1, diff);
            }
        }
    }

    dealDamage(id: EntityID, damage: number, diff: NextTurn) {
        let entity = this.entities.get(id);
        if (entity === undefined) {
            throw new Error("entity undefined?? "+id);
        }
        entity.hp -= damage;
        if (entity.hp > 0) {
            diff.changed.push(entity);
        } else {
            if (entity.holding) {
                let held = this.entities.get(entity.holding);
                if (held === undefined) {
                    throw new Error("entity held undefined?? "+entity.holding);
                }
                held.heldBy = undefined;
                this.addOrUpdateEntity(held);
                diff.changed.push(held);
            }
            this.deleteEntity(entity.id);
            diff.dead.push(entity.id);
        }
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
    *getNewThrowers(): IterableIterator<EntityData> {
        for (var sector of this.sectors.values()) {
            var statueID = sector.getSpawningStatueID();
            if (statueID === undefined) continue;

            // if statue exists in game  
            let statue = this.entities.get(statueID);

            if (!statue) {
                throw new Error("no such statue? "+statueID);
            }

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
                yield newThrower;
            }
        }
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

        if (action.action === "disintegrate") {
            this.dealDamage(entity.id, entity.hp, diff);
            return;
        }

        // TODO: deduct hp from entity if it holds an entity for too long
        if (action.action === "pickup") {
            var pickup = this.entities.get(action.pickupid);
            if(!pickup) {
                diff.failed.push(action);
                diff.reasons.push("No such entity for pickup: "+action.pickupid);
                return;
            }

            if(pickup.id == action.id) {
                diff.failed.push(action);
                diff.reasons.push("Entity cannot pick up itself"+action.id);
                return;
            }

            if(pickup.type !== "thrower") {
                diff.failed.push(action);
                diff.reasons.push("Entity can only pick up Thrower, not: " + pickup.type);
                return;
            }

            if(distance(entity.location, pickup.location) > 2) {
                diff.failed.push(action);
                diff.reasons.push("Pickup distance too far: Entity: " + JSON.stringify(entity.location)
                    + " Pickup: " + JSON.stringify(pickup.location));
                return;
            }

            if(entity.heldBy) {
                diff.failed.push(action);
                diff.reasons.push("Held Entity cannot hold another entity: " + entity.id);
                return;
            }

            if(entity.holding) {
                diff.failed.push(action);
                diff.reasons.push("Entity already holding another entity: " + entity.id 
                    + " holding: " + entity.holding);
                return;
            }

            if(pickup.heldBy) {
                diff.failed.push(action);
                diff.reasons.push("Pickup target already held by another entity: " + pickup.id);
                return;
            }

            if(pickup.holding) {
                diff.failed.push(action);
                diff.reasons.push("Pickup target holding another entity: " + pickup.id);
                return;
            }

            entity.holding = pickup.id;
            entity.holdingEnd = this.nextTurn + 10;
            pickup.heldBy = entity.id;
            // Picked-up entity occupies the same location as its holder
            pickup.location = entity.location;
            this.occupied.delete(pickup.location.x, pickup.location.y);
            
            diff.successful.push(action);
            diff.changed.push(entity, pickup);
            return;
        }

        if (entity.cooldownEnd !== undefined && entity.cooldownEnd > this.nextTurn) {
            diff.failed.push(action);
            diff.reasons.push("Entity still on cool down: " + entity.id);
            return;
        }

        // TODO: take care of deaths (of hit target and/or thrown entity)
        if (action.action === "throw") {
            if (!entity.holding) {
                diff.failed.push(action);
                diff.reasons.push("Entity is not holding anything to throw: " + entity.id);
                return;
            }

            var held = this.entities.get(entity.holding)
            if (!held) {
                diff.failed.push(action);
                diff.reasons.push("Held entity does not exist: " + entity.holding);
                return;
            }

            const initial = entity.location;
            var target_loc: Location = {
                x: initial.x + action.dx,
                y: initial.y + action.dy,
            }
            if (isOutOfBound(target_loc, this.map) || this.occupied.get(target_loc.x, target_loc.y)) {
                diff.failed.push(action);
                diff.reasons.push("Not enough room to throw; must have at least one space free in direction of throwing: " + entity.id
                    + " Direction dx: " + action.dx + " dy: " + action.dy);
                return;
            }
            
            while (!isOutOfBound(target_loc, this.map) && !this.occupied.get(target_loc.x, target_loc.y)) {
                target_loc.x += action.dx;
                target_loc.y += action.dy;
            }
            
            // if target_loc is out of bounds, then target does not exist
            // currently has placeholder damages to different structures
            var target_id = this.occupied.get(target_loc.x, target_loc.y);
            var target;
            if (target_id) {
                target = this.entities.get(target_id);
            }
            if (target) {
                // Target may or may not be destroyed
                if (target.type === "thrower") {
                    this.dealDamage(target.id, 4, diff);
                } else if (target.type === "statue") {
                    this.dealDamage(target.id, 4, diff);
                }
            }

            const final: Location = {
                x: target_loc.x - action.dy,
                y: target_loc.y - action.dy
            }
            held.location = final;
            held.heldBy = undefined;
            this.addOrUpdateEntity(held);
            entity.holding = undefined;
            entity.holdingEnd = undefined;

            diff.successful.push(action)
            diff.changed.push(entity, held);
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
            if (action.action === "move") {
                newEntity = {... entity};
                newEntity.location = action.loc;
                // location of held object moves if the holding entity moves
                if (newEntity.holding) {
                    held = this.entities.get(newEntity.holding) as EntityData;
                    held.location = newEntity.location;
                    diff.changed.push(held);
                }
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
