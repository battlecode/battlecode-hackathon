import { Action, EntityData, SectorData, EntityID, NextTurn, MakeTurn,
    Location, MapTile, TeamData, TeamID, MapFile, GameID, NEUTRAL_TEAM, GameState,
    EntityType, ThrowAction, DisintegrateAction, PickupAction, MoveAction, BuildAction,
    Keyframe } from './schema';
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

const DAMAGES = {
    thrower: 4,
    statue: 4,
    recoil: 2,
    dirt: 1,
    fatigue: 1,
}

/**
 * Note: we return this type instead of throwing errors in the game code.
 * This is because throwing errors is quite slow and users may submit hundreds
 * of erroneous actions.
 * Instead of throwing, return a FastError. To get a value out of a fast error, do:
 * 
 *      if (typeof val === 'string') return val;
 * 
 * and then use val like normal. Note that you *have to do the check* otherwise the error
 * may be missed. Sorry, it's kinda ugly :/
 */
type FastError<T=undefined> = T | string;

export class Game {
    id: GameID;

    dead: EntityID[];
    debug: boolean;
    entities: Map<EntityID, Entity>;
    highestId: number;
    nextTeam: TeamID;
    occupied: LocationMap<EntityID>;
    sectors: LocationMap<Sector>;
    spawned: EntityID[];
    teams: TeamData[];
    turn: number;

    initialState: GameState;

    constructor(id: GameID, map: MapFile, teams: TeamData[], debug: boolean) {
        validateTeams(teams);
        this.id = id;

        this.dead = [];
        this.debug = debug;
        this.entities = new Map();
        this.highestId = 0;
        this.nextTeam = 1;
        this.occupied = new LocationMap(map.width, map.height);
        this.sectors = new LocationMap(map.width, map.height);
        this.spawned = [];
        this.teams = teams;
        this.turn = 0;

        for (var x = 0; x < map.width; x += map.sectorSize) {
            for(var y = 0; y < map.height; y += map.sectorSize) {
                this.sectors.set(x, y, new Sector({y: y, x: x}));
            }
        }

        let state: any = _.cloneDeep(map);
        state.sectors = Array.from(this.sectors.values()).map(Sector.getSectorData);
        this.initialState = state;

        for (var e of map.entities) {
            let err = this.spawnEntity(e);
            if (typeof err === 'string') {
                throw new Error(err);
            }
        }
    }

    /**
     * Returns the first turn of the match.
     * 
     * firstTurn may throw an Error or ClientError, which should
     * be given to the user as a schema.ErrorCommand.
     */
    firstTurn(): NextTurn {
        const turn = this.makeNextTurn();
        if (turn.turn !== 0) {
            throw new Error("firstTurn called on not first turn");
        }

        turn.lastTeamID = 0;
        return turn;
    }

    /**
     * Performs a list of actions on behalf of a team and returns
     * the result of those actions.
     * 
     * makeTurn may throw an Error or ClientError, which should
     * be given to the user as a schema.ErrorCommand.
     */
    makeTurn(team: TeamID, turn: number, actions: Action[]): NextTurn {
        // player will send the last turn id they received
        if (turn !== this.turn + 1) {
            throw new ClientError("wrong turn: given: "+turn+", should be: "+this.turn + 1);
        }
        this.turn += 1;
        if (team !== this.nextTeam) {
            throw new ClientError("wrong team for turn: " + team + ", should be: "+this.nextTeam);
        }
        // we never want to give the neutral team a turn
        if (this.nextTeam === this.teams.length - 1) {
            this.nextTeam = 1;
        } else {
            this.nextTeam++;
        }

        var diff = this.makeNextTurn();
        for (let action of actions) {
            let err = this.doAction(team, action);
            if (typeof err === 'string') {
                diff.failed.push(action);
                diff.reasons.push(err);
            } else {
                diff.successful.push(action)
            }
        }

        // spawn throwers from controlled sectors every 10 turns
        if (turn % 10 === 0) {
            let spawnedThrowers = this.getSpawnedThrowers();

            if (typeof spawnedThrowers === 'string') throw new Error(spawnedThrowers);

            for (var thrower of spawnedThrowers) {
                let err = this.spawnEntity(thrower);
                if (typeof err === 'string') {
                    throw new Error(err);
                }
            }
        }
        // deal fatigue damage
        for (var entity of this.entities.values()) {
            if (entity.holdingEnd && entity.holdingEnd < this.turn) {
                let err = this.dealDamage(entity.id, DAMAGES.fatigue);
                if (typeof err === 'string') {
                    throw new Error(err);
                }
            }
        }
 
        diff.changedSectors = this.getChangedSectors();
        diff.dead = this.getDeadEntities();

        let changed = this.getChangedEntities();
        if (typeof changed === 'string') throw new Error(changed);
        diff.changed = Array.from(changed);

        if (this.debug) {
            this.validate();
        }

        if (turn > 1000) {
            // TODO this is wrong
            diff.winnerID = 1;
        }
        return diff;
    }

    private makeNextTurn(): NextTurn {
        let turn = this.turn;
        let team = this.nextTeam;

        return {
            command: "nextTurn",
            gameID: this.id,
            turn: turn,
            changed: [],
            dead: [],
            changedSectors: [],
            lastTeamID: this.nextTeam - 1 == 0 ?
                this.teams.length - 1 : this.nextTeam - 1,
            successful: [],
            failed: [],
            reasons: [],
            nextTeamID: team
        };
    }

    makeKeyframe(): Keyframe {
        let result: Keyframe = {
            command: "keyframe",
            state: _.clone(this.initialState),
            teams: this.teams
        };
        result.state.sectors = Array.from(this.sectors.values()).map(Sector.getSectorData);
        result.state.entities = Array.from(this.entities.values()).map(e => e.data);
        result.state.teamCount = this.teams.length - 1;
        return result;
    }

    /**
     * returns Sector based on location
     */  
    private getSector(location: Location): FastError<Sector> {
        var x = location.x - location.x % this.initialState.sectorSize;
        var y = location.y - location.y % this.initialState.sectorSize;
        var sector = this.sectors.get(x,y);
        if (!sector) {
            return "sector does not exist: "+JSON.stringify(location);
        }
        return sector;
    }

    private getEntity(id: EntityID): FastError<Entity> {
        let entity = this.entities.get(id);
        if (!entity) {
            return "no such entity: "+id;
        }
        return entity;
    }

    private spawnEntity(entData: EntityData): FastError {
        let current = this.occupied.get(entData.location.x, entData.location.y);
        if (current !== undefined) {
            return "location occupied: "+JSON.stringify(entData.location);
        }

        if (this.entities.has(entData.id)) {
            return "already exists: "+entData.id;
        }
        
        if (entData.type === "statue") {
            var sector = this.getSector(entData.location);
            if (typeof sector === "string") return sector;
            sector.addStatue(entData);
        }

        this.entities.set(entData.id, new Entity(entData));
        this.occupied.set(entData.location.x, entData.location.y, entData.id);
        this.spawned.push(entData.id);

        this.highestId = Math.max(entData.id, this.highestId);
    }

    private dealDamage(id: EntityID, damage: number): FastError {
        let entity = this.getEntity(id);
        if (typeof entity === 'string') return entity;

        entity.hp -= damage;
        if (entity.hp <= 0) {
            if (entity.heldBy === undefined) {
                this.occupied.delete(entity.location.x, entity.location.y);
            }

            if (entity.holding) {
                let held = this.getEntity(entity.holding);
                if (typeof held === 'string') return held;
                held.heldBy = undefined;
                this.occupied.set(held.location.x, held.location.y, held.id);
            }

            // Statues do not move 
            if (entity.type === "statue") {
                var sector = this.getSector(entity.location); 
                if (typeof sector === 'string') return sector;
                sector.deleteStatue(entity);
            }

            this.entities.delete(entity.id);
            this.dead.push(entity.id);
        }
    }

    private getChangedSectors(): SectorData[] {
        let result = new Array<SectorData>();
        for (var sector of this.sectors.values()) {
            if (sector.checkChanged()) {
                result.push(Sector.getSectorData(sector));
            }
        }
        return result;
    }

    private getChangedEntities(): FastError<EntityData[]> {
        let results = new Array<EntityData>();
        for (var id of this.spawned) {
            let ent = this.getEntity(id);
            if (typeof ent === 'string') return ent;
            results.push(ent.data);
        }
        this.spawned = [];
        for (var entity of this.entities.values()) {
            if (entity.checkChanged()) {
                results.push(entity.data);
            }
        }
        return results;
    }

    private getDeadEntities(): EntityID[] {
        let dead = this.dead;
        this.dead = [];
        return dead;
    }

    /**
     * Returns EntityData[] of throwers to be spawned in controlled sectors
     */
    private *getSpawnedThrowers(): IterableIterator<EntityData> {
        for (var sector of this.sectors.values()) {
            var statueID = sector.getSpawningStatueID();
            if (statueID === undefined) continue;

            // if statue exists in game  
            let statue = this.getEntity(statueID);
            if (typeof statue === 'string') throw new Error(statue);

            let next = this.nextLocation(statue.location);
            if (!isOutOfBound(next, this.initialState) && !this.occupied.has(next.x, next.y)) {
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

    // returns a Location of first free space around given location in clockwise direction
    private nextLocation(location: Location): Location {
        let next = { x: location.x, y: location.y };
        let dx = 1;
        let dy = 0;
        let segment_length = 1;
        let segment_passed = 0;
        // rotate clockwise around location until space is free or when max spaces checked
        for (var count = 0; count < 8; count++) {
            next.x += dx;
            next.y += dy;
            segment_passed++;
            if (!isOutOfBound(next, this.initialState) && !this.occupied.has(next.x, next.y)) {
                break;
            }
            if (segment_passed === segment_length) {
                segment_passed = 0;
                let buffer = dx;
                dx = dy;
                dy = -buffer;

                if (dy === 0) {
                    segment_length++;
                }
            }
        }
        return next
    }

    private doDisintegrate(entity: Entity, action: DisintegrateAction): FastError {
        return this.dealDamage(entity.id, entity.hp);
    }

    private doPickup(entity: Entity, action: PickupAction): FastError {
        // TODO: deduct hp from entity if it holds an entity for too long
        var pickup = this.getEntity(action.pickupID);
        if (typeof pickup === 'string') return pickup;

        if (pickup.id === action.id) {
            return "Entity cannot pick up itself"+action.id;
        }

        if (pickup.type !== "thrower") {
            return "Entity can only pick up Thrower, not: " + pickup.type;
        }

        if (distance(entity.location, pickup.location) > 2) {
            return "Pickup distance too far: Entity: " + JSON.stringify(entity.location)
                + " Pickup: " + JSON.stringify(pickup.location);
        }

        if (entity.heldBy) {
            return "Held Entity cannot hold another entity: " + entity.id;
        }

        if (entity.holding) {
            return "Entity already holding another entity: " + entity.id
                + " holding: " + entity.holding;
        }

        if (pickup.heldBy) {
            return "Pickup target already held by another entity: " + pickup.id;
        }

        if (pickup.holding) {
            return "Pickup target holding another entity: " + pickup.id;
        }

        entity.holding = pickup.id;
        entity.holdingEnd = this.turn + 10;
        pickup.heldBy = entity.id;
        // Picked-up entity occupies the same location as its holder
        this.occupied.delete(pickup.location.x, pickup.location.y);
        pickup.location = entity.location;
    }

    private getTile(loc: Location): MapTile {
        return this.initialState.tiles[this.initialState.height - (loc.y+1)][loc.x];
    }

    private doThrow(entity: Entity, action: ThrowAction): FastError {
        if (!entity.holding) {
            return "Entity is not holding anything to throw: " + entity.id;
        }

        var held = this.getEntity(entity.holding)
        if (typeof held === 'string') return held;

        const initial = entity.location;
        var targetLoc: Location = {
            x: initial.x + action.dx,
            y: initial.y + action.dy,
        }
        if (isOutOfBound(targetLoc, this.initialState) || this.occupied.has(targetLoc.x, targetLoc.y)) {
            return "Not enough room to throw; must have at least one space free in direction of throwing: "
                + entity.id + " Direction dx: " + action.dx + " dy: " + action.dy;
        }
        
        // held entity always lands 1 space before target location
        for (var spacesThrown = 0; spacesThrown <= 7; spacesThrown++) {
            if (isOutOfBound(targetLoc, this.initialState) || this.occupied.has(targetLoc.x, targetLoc.y)) { break };
            targetLoc.x += action.dx;
            targetLoc.y += action.dy;
        }
        
        // if targetLoc is out of bounds, then target does not exist
        var targetId = this.occupied.get(targetLoc.x, targetLoc.y);
        var target;
        if (targetId) {
            target = this.getEntity(targetId);
        }
        if (target) {
            // Target may or may not be destroyed
            if (target.type === "thrower") {
                let err = this.dealDamage(target.id, DAMAGES.thrower);
                if (typeof err === "string") return err;
            } else if (target.type === "statue") {
                let err = this.dealDamage(target.id, DAMAGES.statue);
                if (typeof err === "string") return err;
            }
            let err = this.dealDamage(held.id, DAMAGES.recoil);
            if (typeof err === "string") return err;
        }
        var landloc: Location = {
            x: targetLoc.x - action.dx,
            y: targetLoc.y - action.dy
        }
        held.location.x = landloc.x;
        held.location.y = landloc.y;
        held.heldBy = undefined;
        // damage held unit if unit lands on dirt 
        if (this.getTile(landloc) === "D") {
            this.dealDamage(held.id, DAMAGES.dirt);
        }
        entity.holding = undefined;
        entity.holdingEnd = undefined;
    }

    private doBuild(entity: Entity, action: BuildAction): FastError {
        return this.spawnEntity({
            id: this.highestId + 1,
            teamID: entity.teamID,
            type: "statue",
            location: {
                x: entity.location.x + action.dx,
                y: entity.location.y + action.dy,
            },
            hp: 10
        });
    }

    private doMove(entity: Entity, action: MoveAction): FastError {
        this.occupied.delete(entity.location.x, entity.location.y);
        entity.location.x += action.dx;
        entity.location.y += action.dy;
        this.occupied.set(entity.location.x, entity.location.y, entity.id);
        if (entity.holding !== undefined) {
            let held = this.getEntity(entity.holding);
            if (typeof held === 'string') return held;

            held.location.x = entity.location.x;
            held.location.y = entity.location.y;
        }
        return;
    }
 
    private doAction(team: TeamID, action: Action): FastError {
        var entity = this.getEntity(action.id);
        if (typeof entity === 'string') return entity;

        if (entity.teamID !== team) {
            return "wrong team: "+entity.teamID;
        }

        if (entity.cooldownEnd !== undefined && entity.cooldownEnd > this.turn) {
            return "entity still on cool down: " + entity.id + "; "+
                "ends "+entity.cooldownEnd+", current turn: "+this.turn;
        }

        if (entity.type === "statue") {
            return "Statues can't do anything.";
        }

        if (entity.heldBy !== undefined) {
            return "Entity is held, cannot do anything";
        }

        let err;

        if (action.action === "pickup") {
            err = this.doPickup(entity, action);
        } else if (action.action === "throw") {
            err = this.doThrow(entity, action);
        } else if (action.action === "disintegrate") {
            err = this.doDisintegrate(entity, action);
        } else if (action.action === "move" || action.action === "build") {

            if (action.dx === undefined || isNaN(action.dx) || action.dx < -1 || action.dx > 1 ||
                action.dy === undefined || isNaN(action.dx) || action.dy < -1 || action.dy > 1) {
                return "invalid dx,dy: "+action.dx+","+action.dy;
            }

            // shared logic for move and build
            let loc = {
                x: entity.location.x + action.dx,
                y: entity.location.y + action.dy,
            }
            if (distance(entity.location, loc) > 2) {
                return "Distance too far: old: " + JSON.stringify(entity.location)
                     + " new: " + loc;
            }

            if (isOutOfBound(loc, this.initialState)) {
                return "Location out of bounds of map: " + JSON.stringify(loc);
            }

            if (this.occupied.has(loc.x, loc.y)) {
                return "Location already occupied: " + JSON.stringify(loc);
            }

            if (action.action === "move") {
                err = this.doMove(entity, action);
            } else {
                err = this.doBuild(entity, action);
            }
        }

        if (typeof err === 'string') return err;

        // if we're here and didn't throw an error, the action succeeded
        entity.cooldownEnd = this.turn + COOLDOWNS[action.action];
    }

    /**
     * Check invariants.
     */
    private validate() {
        let failures: string[] = [];

        // it's fine to throw errors in validate because validation is already slow
        function unwrap<T>(v: FastError<T>): T {
            if (typeof v === 'string') {
                throw new Error(v);
            }
            return v;
        }

        let assert = (cond: boolean, s: string) => {
            if (!cond) {
                failures.push(s);
            }
        }
        for (let entity of this.entities.values()) {
            let id = entity.id;
            assert(entity.hp > 0, `${id} no hp`);
            if (entity.heldBy !== undefined) {
                assert(unwrap(this.getEntity(entity.heldBy)).holding === entity.id, `${id} held by wrong`);
                assert(entity.holding === undefined, `${id} holding while held`);
            }
            if (entity.holding !== undefined) {
                let held = unwrap(this.getEntity(entity.holding));
                assert(held.heldBy === entity.id, `${id} holding wrong:
                    ${entity.holding} held by ${held.heldBy}`);
                assert(entity.heldBy === undefined, `${id} held while holding`);
                assert(entity.holdingEnd !== undefined, `${id} has no holding end`);
                assert(held.location.x == entity.location.x, `held not over holder x:
                holder ${entity.location.x}, held ${held.location.x}`)
                assert(held.location.y == entity.location.y, `held not over holder y:
                holder ${entity.location.y}, held ${held.location.y}`)
            }
            if (entity.type !== "thrower") {
                assert(entity.cooldownEnd === undefined, `${id} has cooldown while non-thrower`);
            }
            if (entity.heldBy === undefined) {
                assert(this.occupied.get(entity.location.x, entity.location.y) === entity.id,
                    `${id} in wrong location, should be ${entity.location.x} ${entity.location.y}`);
            }
            for (let other of this.entities.values()) {
                if (other === entity) continue;
                if (other.location.x === entity.location.x && other.location.y === entity.location.y) {
                    assert(other.holding === entity.id || other.heldBy === entity.id,
                        `entities in same location not holding: ${entity.id} ${other.id}`);
                }
            }
        }
        let seen: number[] = [];
        for (let [loc, id] of this.occupied.entries()) {
            assert(this.occupied.get(loc.x, loc.y) === id, `broken locationmap`);
            let eLoc = unwrap(this.getEntity(id)).location;
            assert(eLoc.x === loc.x, `wrong x: ${id} occupied ${loc.x}, actual ${eLoc.x}`);
            assert(eLoc.y === loc.y, `wrong y: ${id} occupied ${loc.y}, actual ${eLoc.y}`);

            assert(seen.indexOf(id) === -1, `entity multiply stored: ${id}`);
            seen.push(id);
        }
        for (let [tl, sector] of this.sectors.entries()) {
            assert(this.sectors.get(tl.x, tl.y) === sector, `broken locationmap`);
            assert(this.getSector(tl) === sector, `broken sector lookup: ${tl.x},${tl.y}`);
            assert(sector.topLeft.x === tl.x, `moved sector x`);
            assert(sector.topLeft.y === tl.y, `moved sector y`);
            for (let [teamID, entities] of sector.teams.entries()) {
                for (let id of entities) {
                    let entity = unwrap(this.getEntity(id));
                    assert(entity.type === 'statue', `non-statue stored in sector: ${entity.id}`);
                    assert(unwrap(this.getSector(entity.location)).topLeft.x === tl.x, `entity in wrong sector`);
                    assert(unwrap(this.getSector(entity.location)).topLeft.y === tl.y, `entity in wrong sector`);
                }
            } 
        }
        if (failures.length > 0) {
            console.log("FAILURES:")
            for (let failure of failures) {
                console.log(failure);
            }
            throw new Error("validation failed");
        }
    }
}

const validateTeams = (teams: TeamData[]) => {
    if (teams[0] !== NEUTRAL_TEAM) {
        throw new Error("neutral team is not first!");
    }
    for (let i = 1; i < teams.length; i++) {
        if (teams[i].teamID !== i) {
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
        this.data = _.cloneDeep(data);

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

const COOLDOWNS = {
    "move": 2,
    "throw": 5,
    "pickup": 1,
    "build": 10,
    "disintegrate": 0
}