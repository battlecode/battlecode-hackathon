import { Action, EntityData, SectorData, EntityID, NextTurn, MakeTurn,
    Location, MapTile, TeamData, TeamID, MapFile, GameID, NEUTRAL_TEAM, GameState,
    EntityType, ThrowAction, DisintegrateAction, PickupAction, MoveAction, BuildAction } from './schema';
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

type FailureReason = string;

export class Game {
    id: GameID;
    initialState: GameState;
    map: MapFile;
    teams: TeamData[];
    entities: Map<EntityID, Entity>;
    dead: EntityID[];
    spawned: EntityID[];
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
        this.dead = [];
        this.spawned = [];
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
            this.spawnEntity(e);
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
    private getSector(location: Location): Sector {
        var x = location.x - location.x % this.map.sectorSize;
        var y = location.y - location.y % this.map.sectorSize;
        var sector = this.sectors.get(x,y);
        if (!sector) {
            throw new Error("sector does not exist: "+JSON.stringify(location));
        }
        return sector;
    }

    private getEntity(id: EntityID): Entity {
        let entity = this.entities.get(id);
        if (!entity) {
            throw new Error("no such entity: "+id);
        }
        return entity;
    }

    spawnEntity(entData: EntityData) {
        let current = this.occupied.get(entData.location.x, entData.location.y);
        if (current !== undefined && current !== entData.id) {
            let currentEntity = this.getEntity(current);

            if (currentEntity.heldBy != entData.id && currentEntity.holding != entData.id) {
                throw new Error("location occupied: "+JSON.stringify(entData)+current);
            }
        }

        if (this.entities.has(entData.id)) {
            throw new Error("already exists: "+entData.id);
        }
        
        if (entData.type == "statue") {
            var sector = this.getSector(entData.location);
            sector.addStatue(entData);
        }

        this.entities.set(entData.id, new Entity(entData));
        this.occupied.set(entData.location.x, entData.location.y, entData.id);
        this.spawned.push(entData.id);

        this.highestId = Math.max(entData.id, this.highestId);
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
        for (let action of actions) {
            try {
                this.doAction(team, action);
                diff.successful.push(action)
            } catch (e) {
                diff.failed.push(action);
                if (e instanceof Error) {
                    diff.reasons.push(e.message);
                } else {
                    diff.reasons.push(JSON.stringify(e));
                }
            }
        }

        // spawn throwers from controlled sectors every 10 turns
        if (turn % 10 == 0) {
            for (var thrower of this.getSpawnedThrowers()) {
                this.spawnEntity(thrower);
            }
        }
        // deal fatigue damage
        for (var entity of this.entities.values()) {
            if (entity.holdingEnd && entity.holdingEnd < this.nextTurn) {
                this.dealDamage(entity.id, 1);
            }
        }
 
        diff.changedSectors = Array.from(this.getChangedSectors());
        diff.changed = Array.from(this.getChangedEntities());
        diff.dead = Array.from(this.getDeadEntities());
        diff.nextTeamID = this.nextTeam;

        if (turn > 1000) {
            // TODO this is wrong
            diff.winnerID = 1;
        }
        return diff;
    }

    dealDamage(id: EntityID, damage: number) {
        let entity = this.getEntity(id);
        entity.hp -= damage;
        if (entity.hp <= 0) {
            if (entity.holding) {
                let held = this.getEntity(entity.holding);
                held.heldBy = undefined;
            }

            // Statues do not move 
            if (entity.type == "statue") {
                var sector = this.getSector(entity.location); 
                sector.deleteStatue(entity);
            }

            this.entities.delete(entity.id);
            
            if (entity.heldBy === undefined) {
                this.occupied.delete(entity.location.x, entity.location.y);
            }
 
            this.dead.push(entity.id);
        }
    }

    *getChangedSectors(): IterableIterator<SectorData> {
        for (var sector of this.sectors.values()) {
            if (sector.checkChanged()) {
                yield Sector.getSectorData(sector);
            }
        }
    }

    *getChangedEntities(): IterableIterator<EntityData> {
        for (var id of this.spawned) {
            yield this.getEntity(id).data;
        }
        this.spawned = [];
        for (var entity of this.entities.values()) {
            if (entity.checkChanged()) {
                if (entity.holding && !this.entities.has(entity.holding)) {
                    console.log(new Error("HOLDING").stack);
                }
                yield entity.data;
            }
        }
    }

    *getDeadEntities(): IterableIterator<EntityID> {
        let dead = this.dead;
        this.dead = [];
        for (let id of dead) {
            yield id;
        }
    }

    /**
     * Returns EntityData[] of throwers to be spawned in controlled sectors
     */
    *getSpawnedThrowers(): IterableIterator<EntityData> {
        for (var sector of this.sectors.values()) {
            var statueID = sector.getSpawningStatueID();
            if (statueID === undefined) continue;

            // if statue exists in game  
            let statue = this.getEntity(statueID);

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

    private doDisintegrate(entity: Entity, action: DisintegrateAction): FailureReason | undefined {
        this.dealDamage(entity.id, entity.hp);
        return;
    }

    private doPickup(entity: Entity, action: PickupAction): void {
        // TODO: deduct hp from entity if it holds an entity for too long
        var pickup = this.getEntity(action.pickupID);

        if (pickup.id == action.id) {
            throw new ClientError("Entity cannot pick up itself"+action.id);
        }

        if (pickup.type !== "thrower") {
            throw new ClientError("Entity can only pick up Thrower, not: " + pickup.type);
        }

        if (distance(entity.location, pickup.location) > 2) {
            throw new ClientError("Pickup distance too far: Entity: " + JSON.stringify(entity.location)
                + " Pickup: " + JSON.stringify(pickup.location));
        }

        if (entity.heldBy) {
            throw new ClientError("Held Entity cannot hold another entity: " + entity.id);
        }

        if (entity.holding) {
            throw new ClientError("Entity already holding another entity: " + entity.id
                + " holding: " + entity.holding);
        }

        if (pickup.heldBy) {
            throw new ClientError("Pickup target already held by another entity: " + pickup.id);
        }

        if (pickup.holding) {
            throw new ClientError("Pickup target holding another entity: " + pickup.id);
        }

        entity.holding = pickup.id;
        entity.holdingEnd = this.nextTurn + 10;
        pickup.heldBy = entity.id;
        // Picked-up entity occupies the same location as its holder
        pickup.location = entity.location;
        this.occupied.delete(pickup.location.x, pickup.location.y);
    }

    private doThrow(entity: Entity, action: ThrowAction): void {
        if (!entity.holding) {
            throw new ClientError("Entity is not holding anything to throw: " + entity.id);
        }

        var held = this.getEntity(entity.holding)

        const initial = entity.location;
        var targetLoc: Location = {
            x: initial.x + action.dx,
            y: initial.y + action.dy,
        }
        if (isOutOfBound(targetLoc, this.map) || this.occupied.get(targetLoc.x, targetLoc.y)) {
            throw new ClientError("Not enough room to throw; must have at least one space free in direction of throwing: "
                + entity.id + " Direction dx: " + action.dx + " dy: " + action.dy);
        }
        
        while (!isOutOfBound(targetLoc, this.map) && !this.occupied.get(targetLoc.x, targetLoc.y)) {
            targetLoc.x += action.dx;
            targetLoc.y += action.dy;
        }
        
        // if targetLoc is out of bounds, then target does not exist
        // currently has placeholder damages to different structures
        var targetId = this.occupied.get(targetLoc.x, targetLoc.y);
        var target;
        if (targetId) {
            target = this.getEntity(targetId);
        }
        if (target) {
            // Target may or may not be destroyed
            if (target.type === "thrower") {
                this.dealDamage(target.id, 4);
            } else if (target.type === "statue") {
                this.dealDamage(target.id, 4);
            }
        }
            
        held.location.x = targetLoc.x - action.dx;
        held.location.y = targetLoc.y - action.dy;
        held.heldBy = undefined;
        //this.addOrUpdateEntity(held);
        entity.holding = undefined;
        entity.holdingEnd = undefined;
    }

    private doBuild(entity: Entity, action: BuildAction): void {
        this.spawnEntity({
            id: this.highestId + 1,
            teamID: entity.teamID,
            type: "statue",
            location: {
                x: entity.location.x + action.dx,
                y: entity.location.x + action.dx,
            },
            hp: 10
        });
    }
    private doMove(entity: Entity, action: MoveAction): void {
        this.occupied.delete(entity.location.x, entity.location.y);
        entity.location.x += action.dx;
        entity.location.y += action.dy;
        this.occupied.set(entity.location.x, entity.location.y, entity.id);
    }
 
    private doAction(team: TeamID, action: Action): void {
        var entity = this.getEntity(action.id);

        if (entity.teamID !== team) {
            throw new ClientError("wrong team: "+entity.teamID);
        }

        if (entity.cooldownEnd !== undefined && entity.cooldownEnd > this.nextTurn) {
            throw new ClientError("entity still on cool down: " + entity.id);
        }

        if (action.action === "pickup") {
            this.doPickup(entity, action);
        } else if (action.action === "throw") {
            this.doThrow(entity, action);
        } else if (action.action === "disintegrate") {
            this.doDisintegrate(entity, action);
        } else if (action.action === "move" || action.action === "build") {

            if (action.dx === undefined || isNaN(action.dx) || action.dx < -1 || action.dx > 1 ||
                action.dy === undefined || isNaN(action.dx) || action.dy < -1 || action.dy > 1) {
                throw new ClientError("invalid dx,dy: "+action.dx+","+action.dy);
            }

            // shared logic for move and build
            let loc = {
                x: entity.location.x + action.dx,
                y: entity.location.y + action.dy,
            }
            if (distance(entity.location, loc) > 2) {
                throw new ClientError("Distance too far: old: " + JSON.stringify(entity.location)
                     + " new: " + loc);
            }

            if (isOutOfBound(loc, this.map)) {
                throw new ClientError("Location out of bounds of map: " + JSON.stringify(loc));
            }

            if (this.occupied.has(loc.x, loc.y)) {
                throw new ClientError("Location already occupied: " + JSON.stringify(loc));
            }

            if (entity.type === "statue") {
                throw new ClientError("Statues can't move or build. (They build automatically.)");
            }

            if (action.action === "move") {
                this.doMove(entity, action);
            } else {
                this.doBuild(entity, action);
            }
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

/**
 * Acts like an EntityData, but when you set a property the "dirty" flag is set to true.
 */
export class Entity {
    data: EntityData;
    private _location: Location;
    dirty: boolean;

    constructor(data: EntityData) {
        this.data = data;

        // slightly magical handling for locations
        const owner = this;
        this._location = {
            get x() {
                return owner.data.location.x;
            },
            set x(x: number) {
                owner.data.location.x = x;
                owner.dirty = true;
            },
            get y() {
                return owner.data.location.y;
            },
            set y(y: number) {
                owner.data.location.y = y;
                owner.dirty = true;
            }
        };
        // entities start non-dirty, but are added to spawned
        this.dirty = false;
    }

    checkChanged(): boolean {
        let result = this.dirty;
        this.dirty = false;
        return result;
    }

    get id(): EntityID      { return this.data.id; }
    get type(): EntityType  { return this.data.type; }
    get hp(): number        { return this.data.hp; }
    get teamID(): TeamID    { return this.data.teamID; }
    get cooldownEnd(): number | undefined   { return this.data.cooldownEnd; }
    get heldBy(): EntityID | undefined      { return this.data.heldBy; }
    get holding(): EntityID | undefined     { return this.data.holding; }
    get holdingEnd(): number | undefined    { return this.data.holdingEnd; }

    get location(): Location {
        return this._location;
    }
    set location(location: Location) {
        this.location.x = location.x;
        this.location.y = location.y;
    }

    set id(id: EntityID) { this.data.id = id; this.dirty = true; }
    set type(type: EntityType) { this.data.type = type; this.dirty = true; }
    set hp(hp: number) { this.data.hp = hp; this.dirty = true; }
    set teamID(teamID: TeamID) { this.data.teamID = teamID; this.dirty = true; }
    set cooldownEnd(cooldownEnd: number | undefined) { this.data.cooldownEnd = cooldownEnd; this.dirty = true; }
    set heldBy(heldBy: EntityID | undefined) { this.data.heldBy = heldBy; this.dirty = true; }
    set holding(holding: EntityID | undefined) { this.data.holding = holding; this.dirty = true; }
    set holdingEnd(holdingEnd: number | undefined) { this.data.holdingEnd = holdingEnd; this.dirty = true; }
}