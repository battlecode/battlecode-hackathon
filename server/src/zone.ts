import { SectorData, EntityID, EntityData, TeamID, Location } from './schema';

export class Sector{
    teams: Map<TeamID, EntityID[]>;
    top_left: Location;

    constructor(top_left : Location) {
       this.teams = new Map();
       this.top_left = top_left;
    }

    /**
    * Get or create new [] of statues if team does not exist in teams
    */
    getOrCreateTeam(team : TeamID): EntityID[]{
        if (!this.teams.has(team)) {
            this.teams.set(team, []);
        }
        return this.teams.get(team) as EntityID[];
    }

    getTeam(id : TeamID){
        var team = this.teams.get(id);
        if (!team) {
            throw new Error("Nonexistent team in sector"+id);
        }
        return team;
    }

    addStatue(statue: EntityData) {
       var team = this.getOrCreateTeam(statue.team);
       if (team.indexOf(statue.id) > -1) {
           throw new Error("Statue already exists in Sector"+statue.id);
       }
       team.push(statue.id);
    }

    deleteStatue(statue: EntityData) {
        var team = this.getTeam(statue.team); 
        var index = team.indexOf(statue.id);
        if (index < 0) {
            throw new Error("Can't delete nonexistent statue from sector"+statue.id);
        }
        team.splice(index, 1);
    }

    /**
    *returns id of team controlling sector or -1 if no team controlling
    */
    getControllingTeamID(): TeamID {
        var control = -1;
        for (var teamID of this.teams.keys()) {
            var team = this.getTeam(teamID);
            if (team.length > 0) {
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

    /**
    * returns id of oldest statue from team, or -1 if no statue exists
    * oldest statue is statue with lowest id 
    */
    getOldestStatueID(team : TeamID): EntityID {
        var oldest: EntityID = -1; 
        if (!this.teams.has(team)) {
            return oldest;
        }

        for (var statue of this.getTeam(team)) {
            if (oldest == -1 || statue < oldest) {
                oldest = statue;
            }
        }
        return oldest;
    }
    
    /**
    * returns id of spawning statue from controlling team or -1 if no team controlling
    */
    getSpawningStatueID(): EntityID {
        var team = this.getControllingTeamID();
        return this.getOldestStatueID(team);
    }

    static getSectorData(sector: Sector): SectorData {
        var data: SectorData = {
            top_left: sector.top_left,
            controlling_team: sector.getControllingTeamID()
        }
        return data
    }
}