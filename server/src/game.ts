import { Action, EntityData, SectorData, EntityID, NextTurn, MakeTurn,
    Location, MapTile, TeamData, TeamID, MapData, NEUTRAL_TEAM } from './schema';
import { Sector } from './zone';
import LocationMap from './locationmap';

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

export class Game {
    world: MapData;
    teams: TeamData[];
    entities: Map<EntityID, EntityData>;
    occupied: LocationMap<EntityID>;
    sectors: LocationMap<Sector>;
    highestId: number;
    // ids must be consecutive
    nextTeam: TeamID;
    nextTurn: number;

    constructor(world: MapData, teams: TeamData[]) {
        validateTeams(teams);
        this.nextTurn = 0;
        this.highestId = 0;
        this.world = world;
        this.teams = teams;
        this.nextTeam = teams[1].id;
        this.entities = new Map();
        // occupied stores location (x, y) as keys and EntityID as values
        this.occupied = new LocationMap(world.width, world.height);
        this.sectors = new LocationMap(world.width, world.height);

        for (var x = 0; x < this.world.width; x += this.world.sector_size) {
            for(var y = 0; y < this.world.height; y += this.world.sector_size) {
                this.sectors.set(x, y, new Sector({y: y, x: x}));
            }
        }
    }

    private makeNextTurn(): NextTurn {
        let turn = this.nextTurn;
        this.nextTurn++;
        return {
            command: "next_turn",
            turn: turn,
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
        if (this.nextTurn !== 0) {
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

    makeTurn(team: TeamID, turn: number, actions: Action[]): NextTurn {
        // player will send the last turn id they received
        const correctTurn = this.nextTurn - 1;
        if (turn !== correctTurn) {
            throw new Error("wrong turn: given: "+turn+", should be: "+correctTurn);
        }
        if (team !== this.nextTeam) {
            throw new Error("wrong team for turn: " + team + ", should be: "+this.nextTeam);
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

        if (action.action === "disintegrate") {
            this.deleteEntity(action.id);

            diff.dead.push(entity.id);
            diff.successful.push(action);
            return;
        }

        // TODO: Implement fatigue(?) meter to decrease holding robot hp once it holds another robot for > 10 turns
        if (action.action === "pickup") {
            var pickup = this.entities.get(action.pickupid);
            if(!pickup) {
                diff.failed.push(action);
                diff.reasons.push("No such entity for pickup: "+action.pickupid);
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
                    + " Pickup: " + JSON.stringify(pickup.location))
                return;
            }

            if(entity.held_by) {
                diff.failed.push(action);
                diff.reasons.push("Held Entity cannot hold another entity: " + entity.id)
                return;
            }

            if(entity.holding) {
                diff.failed.push(action);
                diff.reasons.push("Entity already holding another entity: " + entity.id 
                    + " holding: " + entity.holding)
                return;
            }

            if(pickup.held_by) {
                diff.failed.push(action);
                diff.reasons.push("Pickup target already held by another entity: " + pickup.id)
                return;
            }

            if(pickup.holding) {
                diff.failed.push(action);
                diff.reasons.push("Pickup target holding another entity: " + pickup.id)
                return;
            }

            entity.holding = pickup.id;
            pickup.held_by = true;
            // Picked-up entity occupies the same location as its holder
            pickup.location = entity.location;
            this.occupied.delete(pickup.location.x, pickup.location.y);
            
            diff.successful.push(action)
            diff.changed.push(entity, pickup)
            return;
        }

        if (entity.cooldown_end !== undefined && entity.cooldown_end > this.nextTurn) {
            diff.failed.push(action);
            diff.reasons.push("Entity still on cool down: " + entity.id);
            return;
        }

        // TODO: take care of deaths (of hit target and/or thrown entity)
        if (action.action === "throw") {
            if (!entity.holding) {
                diff.failed.push(action);
                diff.reasons.push("Entity is not holding anything to throw: " + entity.id)
                return;
            }

            var held = this.entities.get(entity.holding)
            if (!held) {
                diff.failed.push(action);
                diff.reasons.push("Held entity does not exist: " + entity.holding)
                return;
            }

            const initial = entity.location;
            var target_loc: Location = {
                x: initial.x + action.dx,
                y: initial.y + action.dy,
            }
            if (isOutOfBound(target_loc, this.world) || this.occupied.get(target_loc.x, target_loc.y)) {
                diff.failed.push(action);
                diff.reasons.push("Not enough room to throw; must have at least one space free in direction of throwing: " + entity.id
                    + " Direction dx: " + action.dx + " dy: " + action.dy);
                return;
            }
            
            while (!isOutOfBound(target_loc, this.world) && !this.occupied.get(target_loc.x, target_loc.y)) {
                target_loc.x += action.dx;
                target_loc.y += action.dy;
            }
            
            // if target_loc is out of bounds, then target does not exist
            // placeholder damages to different structures
            var target_id = this.occupied.get(target_loc.x, target_loc.y);
            var target;
            if (target_id) {
                target = this.entities.get(target_id);
            }
            if (target) {
                // Target may or may not be destroyed
                if (target.type === "thrower")
                    target.hp -= 99999
                if (target.type === "statue")
                    target.hp -= 99999
            }

            const final: Location = {
                x: target_loc.x - action.dy,
                y: target_loc.y - action.dy
            }
            held.location = final;
            held.held_by = false;
            this.addOrUpdateEntity(held);
            entity.holding = undefined;

            diff.successful.push(action)
            if (target) {
                diff.changed.push(target)
            }
            diff.changed.push(entity, held)
        }

        if (action.action === "move" || action.action === "build") {
            if (distance(entity.location, action.loc) > 2) {
                diff.failed.push(action);
                diff.reasons.push("Distance too far: old: " + JSON.stringify(entity.location)
                     + " new: " + action.loc);
                return;
            }

            if (isOutOfBound(action.loc, this.world)) {
                diff.failed.push(action);
                diff.reasons.push("Location out of bounds of world: " + JSON.stringify(action.loc));
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
