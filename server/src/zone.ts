import { SectorData, EntityID, EntityData, TeamID, Location } from './schema';

export class Sector implements SectorData{ 
    teams : Map<TeamID, Map<EntityID, EntityData>>;
    top_left : Location;
    constructor(top_left : Location) {
       this.teams = new Map();
       this.top_left = top_left;
    }

    // Get or create new Map<EntityID, entity> of statues if team does not exist in teams
    getOrCreateTeam(team : TeamID) : Map<EntityID, EntityData>{
        if (!this.teams.has(team)) {
            this.teams.set(team, new Map<EntityID, EntityData>());
        }
        return this.teams.get(team) as Map<EntityID, EntityData>;
    }

    getTeam(id : TeamID) : Map<EntityID, EntityData> {
        var team = this.teams.get(id);
        if (!team) {
            throw new Error("Nonexistent team in sector"+id);
        }
        return team;
    }

    addStatue(statue: EntityData) {
       var team = this.getOrCreateTeam(statue.team);
       team.set(statue.id, statue);
    }

    deleteStatue(statue: EntityData) {
        var team = this.getTeam(statue.team); 
        if (!team.has(statue.id)) {
            throw new Error("Can't delete nonexistent statue from sector"+statue.id);
        }
        team.delete(statue.id);
    }

    // returns id of team controlling sector or -1 if no team controlling
    getControllingTeamID() {
        var control = -1;
        for (var teamID of this.teams.keys()) {
            var team = this.teams.get(teamID) as Map<EntityID, EntityData>;
            if (team.size > 0) {
                if (control < 0) {
                    control = teamID;
                }
                else {
                    control = -1;
                    break;
                }
            }
        }
        return control;
    }

    // returns oldest statue from team, or null if no statue exists
    // oldest statue is statue with lowest id 
    getOldestStatue(team : TeamID) : EntityData | null {
        var oldest : EntityData | null = null; 
        if (!this.teams.has(team)) {
            return null;
        }
        for (var statue of this.getTeam(team).values()) {
            if (oldest == null || statue.id < oldest.id) {
                oldest = statue;
            }
        }
        return oldest;
    }
    
    // returns spawning statue from controlling team or null if no team controlling
    getSpawningStatue() : EntityData | null {
        var team = this.getControllingTeamID();
        return this.getOldestStatue(team);
    }
}